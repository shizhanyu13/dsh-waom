/**
 * Ironbound WAOM autonomous-ops service plugin: monitor targets, decide, drive
 * a fix subagent, evaluate independently (GAN), notify.
 *
 * The ported change vs. `scripts/waom/waom-orchestrator.py` is the EXECUTION
 * layer: it no longer shells out to `claude -p`; it drives a DSH subagent via
 * `ctx.subagents.start`, whose `parent` is a seat agent this service owns.
 *
 * Parent-agent design (see docs/dsh-waom-parent-agent-design.md, Option B):
 * a host-level service has no natural Agent, so this plugin resolves a seed
 * parent agent lazily — it adopts a live root agent via `ctx.agents.roots()`,
 * or a configured `seedSessionId`. Creating a dedicated long-lived seed agent
 * via the agent-factory seam is deferred (see Known Limitations).
 *
 * @module @deepseek-ai/dsh-waom
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SubagentStartRequest } from '@deepseek-ai/dsh-subagent'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'waom'

/** Services required before the cycle driver can resolve a parent and spawn a fix agent. */
export const inject = ['subagents', 'agents', 'sessions']

/** One monitored target. */
export interface WaomMonitor {
  id: string
  /** URL to probe; reachable+healthy is the happy-path gate. */
  url: string
  /** Expected healthy HTTP status (default 200). */
  healthyCode?: number
  /** Whether an independent fix+verify cycle may run when unhealthy. */
  fixable?: boolean
}

/** The result of probing one monitor. */
export interface ProbeResult {
  status: number
  reachable: boolean
  healthy: boolean
}

/** A decision the planner reaches for one probe. */
export interface Decision {
  needs_fix?: boolean
  root_cause?: string
  action?: string
  confidence?: number
}

/** Plugin config. */
export interface Config {
  monitors?: WaomMonitor[]
  /** Host-level cycle interval in ms (0 disables the ticker). */
  intervalMs?: number
  /** The subagent provider name used to drive the fix agent. */
  subagentProvider?: string
  /** Extra surgical constraints appended to the fix agent prompt. */
  surgicalConstraints?: string[]
  /** Optional session id whose agent becomes the seed parent. */
  seedSessionId?: string
}

export const Config: z<Config> = z.object({
  monitors: z.array(z.object({
    id: z.string(),
    url: z.string(),
    healthyCode: z.number().default(200),
    fixable: z.boolean().default(false),
  })).default([]),
  intervalMs: z.number().min(0).default(0),
  subagentProvider: z.string().default('spawn'),
  surgicalConstraints: z.array(z.string()).default([]),
  seedSessionId: z.string().default(''),
})

/** The format of a cycle result so a caller/host can read it. */
export interface CycleResult {
  monitor: string
  healthy: boolean
  decision: Decision
  fix?: unknown
  evaluation?: { passed: boolean; reason: string }
}

/**
 * Probe a monitor target; the happy-path gate is HTTP reachable + healthy code.
 * `fetchImpl` is injectable for tests; defaults to the global fetch.
 */
export async function probe(monitor: WaomMonitor, fetchImpl: typeof fetch = fetch): Promise<ProbeResult> {
  try {
    const res = await fetchImpl(monitor.url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
    const healthy = res.status === (monitor.healthyCode ?? 200)
    return { status: res.status, reachable: true, healthy }
  } catch {
    return { status: 0, reachable: false, healthy: false }
  }
}

/** A thresholded fallback decision when no LLM route is wired. */
export function heuristicDecide(healthy: boolean): Decision {
  return healthy
    ? { needs_fix: false, confidence: 1 }
    : { needs_fix: true, confidence: 0.55, action: 'fix', root_cause: 'target unhealthy' }
}

/**
 * Independent GAN-style evaluation: PASS only when the target is healthy after
 * a fix. Kept pure so it is directly testable (the real HTTP probe is injected).
 */
export function evaluate(probeAfter: ProbeResult): { passed: boolean; reason: string } {
  if (probeAfter.healthy) return { passed: true, reason: 'target healthy after fix' }
  return { passed: false, reason: `target still unhealthy (status ${probeAfter.status})` }
}

/** Build the fix prompt from a decision and the surgical constraints. */
export function buildFixPrompt(decision: Decision, constraints: string[]): ContentBlock[] {
  return [{
    type: 'text',
    text: `[WAOM fix] ${decision.action}: ${decision.root_cause ?? ''}\n` + constraints.join('\n'),
  }]
}

/**
 * Resolve the seed parent agent for a cycle. Prefers the configured
 * `seedSessionId`'s live agent (`ctx.agents.get`), else a live root agent
 * (`ctx.agents.roots()`). Fails loud when neither is available. Auto-creating a
 * dedicated seed agent via `ctx.agents.create` is deferred (that would create a
 * durable session; see README Known Limitations).
 */
export async function resolveParent(ctx: Context, seedSessionId: string | undefined): Promise<Agent> {
  if (seedSessionId) {
    const bySeed = ctx.agents.get(seedSessionId as SessionId)
    if (bySeed) return bySeed
  }
  const root = ctx.agents.roots()[0]
  if (root) return root
  throw new Error('waom: no parent agent available (no live root and no resolvable seedSessionId)')
}

/**
 * Install the waom service.
 * @param ctx - context; the provided service is scoped and disposed with it.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  const provider = config.subagentProvider as string
  const intervalMs = config.intervalMs as number
  const constraints = config.surgicalConstraints as string[]

  /** Drive one autonomous cycle, obtaining the seed parent lazily. */
  async function runCycle(monitor: WaomMonitor): Promise<CycleResult> {
    const probeResult = await probe(monitor)
    const decision = heuristicDecide(probeResult.healthy)
    if (!decision.needs_fix || !monitor.fixable) {
      return { monitor: monitor.id, healthy: probeResult.healthy, decision }
    }
    const parent = await resolveParent(ctx, config.seedSessionId)
    const request: SubagentStartRequest = {
      label: `waom:${monitor.id}`,
      prompt: buildFixPrompt(decision, constraints),
      parent,
      signal: AbortSignal.timeout(120000),
    }
    const run = await ctx.subagents.start(provider, request)
    const result = await run.result
    return {
      monitor: monitor.id,
      healthy: probeResult.healthy,
      decision,
      fix: result.structured ?? result,
    }
  }

  ctx.provide('waom', {
    run: (monitor: WaomMonitor) => runCycle(monitor),
    monitors: () => config.monitors as WaomMonitor[],
  })

  // Host-level ticker (0 disables). The per-cycle self-owned parent resolves
  // lazily via resolveParent; the ticker stays, but autonomous host scheduling
  // is deferred pending a host-level driver decision (see Known Limitations).
  if (intervalMs > 0) {
    const timer = setInterval(() => {
      void ctx.logger?.info?.('waom: tick — host-level autonomous scheduling deferred')
    }, intervalMs)
    ctx.effect(() => () => { clearInterval(timer) }, 'waom.ticker()')
  }
}
