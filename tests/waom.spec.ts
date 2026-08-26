/**
 * Unit + load-path coverage for @deepseek-ai/dsh-waom. Pure helpers (probe,
 * heuristicDecide, evaluate, buildFixPrompt) are covered directly with an
 * injected fetch; the cycle that drives `ctx.subagents.start` requires the
 * scripted-provider real-composition harness (deferred, see README Known
 * Limitations).
 */

import { describe, expect, it } from 'vitest'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import * as waom from '@deepseek-ai/dsh-waom'
import {
  buildFixPrompt,
  evaluate,
  heuristicDecide,
  probe,
  resolveParent,
  type WaomMonitor,
} from '@deepseek-ai/dsh-waom'

const monitor: WaomMonitor = { id: 'svc', url: 'https://example/health', healthyCode: 200 }

describe('waom pure helpers', () => {
  it('probe classifies a healthy 200', async () => {
    const fetchImpl = (async () => ({ status: 200 })) as unknown as typeof fetch
    await expect(probe(monitor, fetchImpl)).resolves.toMatchObject({ status: 200, reachable: true, healthy: true })
  })

  it('probe marks an unreachable target down', async () => {
    const fetchImpl = (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch
    await expect(probe(monitor, fetchImpl)).resolves.toMatchObject({ status: 0, reachable: false, healthy: false })
  })

  it('heuristicDecide stays put on a healthy target and plans a fix on a down one', () => {
    expect(heuristicDecide(true)).toMatchObject({ needs_fix: false })
    const down = heuristicDecide(false)
    expect(down).toMatchObject({ needs_fix: true, action: 'fix' })
    expect(down.confidence).toBe(0.55)
  })

  it('evaluate passes only when the target is healthy after the fix', () => {
    expect(evaluate({ status: 200, reachable: true, healthy: true })).toMatchObject({ passed: true })
    expect(evaluate({ status: 500, reachable: true, healthy: false })).toMatchObject({ passed: false })
  })

  it('buildFixPrompt embeds the action, root cause, and constraints', () => {
    const blocks = buildFixPrompt({ action: 'fix', root_cause: 'down' }, ['diff<=30'])
    const block = blocks[0]
    if (block?.type !== 'text') throw new Error('expected a text content block')
    const text = block.text
    expect(text).toContain('fix')
    expect(text).toContain('down')
    expect(text).toContain('diff<=30')
  })
})

describe('waom parent resolution', () => {
  it('adopts a live root agent when one exists', async () => {
    const root = { ok: true } as never
    const ctx = { agents: { roots: () => [root], get: () => undefined } } as never
    await expect(resolveParent(ctx, undefined)).resolves.toBe(root)
  })

  it('resolves a configured seedSessionId to its live agent (ctx.agents.get)', async () => {
    const seed = { ok: true } as never
    const ctx = { agents: { roots: () => [], get: (_id: string) => seed } } as never
    await expect(resolveParent(ctx, 'seed-session')).resolves.toBe(seed)
  })

  it('fails loudly with no root and no seedSessionId', async () => {
    const ctx = { agents: { roots: () => [], get: () => undefined } } as never
    await expect(resolveParent(ctx, undefined)).rejects.toThrow(/no parent agent available/)
  })
})

describe('waom load-path guard', () => {
  it('has no default export and keeps name/inject/apply through unwrapExports', () => {
    expect('default' in waom).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(waom) as Record<string, unknown>
    expect(unwrapped).toBe(waom)
    expect(unwrapped.name).toBe('waom')
    expect(unwrapped.inject).toEqual(['subagents', 'agents', 'sessions'])
    expect(typeof unwrapped.apply).toBe('function')
  })
})
