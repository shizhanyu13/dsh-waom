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
 * @module @shizhanyu13/dsh-waom
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "waom";
/** Services required before the cycle driver can resolve a parent and spawn a fix agent. */
export declare const inject: string[];
/** One monitored target. */
export interface WaomMonitor {
    id: string;
    /** URL to probe; reachable+healthy is the happy-path gate. */
    url: string;
    /** Expected healthy HTTP status (default 200). */
    healthyCode?: number;
    /** Whether an independent fix+verify cycle may run when unhealthy. */
    fixable?: boolean;
}
/** The result of probing one monitor. */
export interface ProbeResult {
    status: number;
    reachable: boolean;
    healthy: boolean;
}
/** A decision the planner reaches for one probe. */
export interface Decision {
    needs_fix?: boolean;
    root_cause?: string;
    action?: string;
    confidence?: number;
}
/** Plugin config. */
export interface Config {
    monitors?: WaomMonitor[];
    /** Host-level cycle interval in ms (0 disables the ticker). */
    intervalMs?: number;
    /** The subagent provider name used to drive the fix agent. */
    subagentProvider?: string;
    /** Extra surgical constraints appended to the fix agent prompt. */
    surgicalConstraints?: string[];
    /** Optional session id whose agent becomes the seed parent. */
    seedSessionId?: string;
}
export declare const Config: z<Config>;
/** The format of a cycle result so a caller/host can read it. */
export interface CycleResult {
    monitor: string;
    healthy: boolean;
    decision: Decision;
    fix?: unknown;
    evaluation?: {
        passed: boolean;
        reason: string;
    };
}
/**
 * Probe a monitor target; the happy-path gate is HTTP reachable + healthy code.
 * `fetchImpl` is injectable for tests; defaults to the global fetch.
 */
export declare function probe(monitor: WaomMonitor, fetchImpl?: typeof fetch): Promise<ProbeResult>;
/** A thresholded fallback decision when no LLM route is wired. */
export declare function heuristicDecide(healthy: boolean): Decision;
/**
 * Independent GAN-style evaluation: PASS only when the target is healthy after
 * a fix. Kept pure so it is directly testable (the real HTTP probe is injected).
 */
export declare function evaluate(probeAfter: ProbeResult): {
    passed: boolean;
    reason: string;
};
/** Build the fix prompt from a decision and the surgical constraints. */
export declare function buildFixPrompt(decision: Decision, constraints: string[]): ContentBlock[];
/**
 * Resolve the seed parent agent for a cycle. Prefers the configured
 * `seedSessionId`'s live agent (`ctx.agents.get`), else a live root agent
 * (`ctx.agents.roots()`). Fails loud when neither is available. Auto-creating a
 * dedicated seed agent via `ctx.agents.create` is deferred (that would create a
 * durable session; see README Known Limitations).
 */
export declare function resolveParent(ctx: Context, seedSessionId: string | undefined): Promise<Agent>;
/**
 * Install the waom service.
 * @param ctx - context; the provided service is scoped and disposed with it.
 * @param config - validated {@link Config}.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map