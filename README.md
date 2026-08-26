# dsh-waom

`@deepseek-ai/dsh-waom` — an **Ironbound WAOM autonomous-ops service** plugin for
the DeepSeek Harness. It monitors a target, decides a fix, drives a **DeepSeek
Harness subagent** to implement it (instead of shelling out to `claude -p`),
evaluates the result independently (GAN-style), and can notify.

## What it does

The execution-layer port of `scripts/waom/waom-orchestrator.py`:

1. **Probe** the monitor target (`HEAD` request).
2. **Decide** — a heuristic fallback (`heuristicDecide`) when no LLM route is wired.
3. **Drive a fix subagent** via `ctx.subagents.start(provider, request)` with a
   real `ContentBlock[]` prompt.
4. **Evaluate independently** — PASS only when the target is healthy after the
   fix (`evaluate`).
5. **Notify** (not yet wired).

The fix subagent's **parent agent is resolved internally** by the plugin
(`resolveParent`), not passed by the caller:

- Prefer a configured `seedSessionId`'s live agent (`ctx.agents.get`).
- Else adopt a live root agent (`ctx.agents.roots()[0]`).
- Else fail loud.

## Install

```sh
npm install @deepseek-ai/dsh-waom@0.1.0
```

The package ships a **self-contained prebuilt ESM** bundle (`lib/index.js`)
plus `.d.ts` types — no runtime deps and no build step at install time. It needs
a DeepSeek Harness host that provides the peer `@deepseek-ai/*` packages.

## Configuration

Add the plugin to a profile's `cordis.patch.yml`:

```yaml
- id: waom
  name: '@deepseek-ai/dsh-waom'
  config:
    subagentProvider: spawn     # default 'spawn'
    intervalMs: 0               # 0 → no automatic host ticker (manual only)
    seedSessionId: ''           # optional; '' → adopt a live root agent
    surgicalConstraints: []     # extra constraints appended to the fix prompt
    monitors:
      - { id: my-service, url: https://your/health, fixable: true }
```

## Usage

### Manual trigger (recommended when `intervalMs: 0`)

Drive a single cycle by calling the `waom` service the plugin provides. The
service resolves its own seed parent internally:

```ts
const waom = ctx.get('waom')
const result = await waom.run({ id: 'svc', url: 'https://your/health', fixable: true })
// { monitor, healthy, decision, fix?, evaluation? }
```

### Automatic traversal

Set `intervalMs > 0` to enable the host ticker. **Note:** the ticker is a
skeleton — autonomous host-level scheduling is deferred until a host-level
driver decision is made (see Known Limitations).

## Default behavior

- **Inert by default**: `intervalMs` `0` and no `monitors` means no cycles run.
- It only provides the `waom` service a profile may drive on demand.
- It is a **service, not a tool**: it never appears in the model's tool catalog,
  so it has no request-cache effect.

## Known Limitations

- **Auto-creating a dedicated seed parent is deferred.** `resolveParent` maps a
  configured `seedSessionId` to its live agent and falls back to a live root
  agent, or fails loud — it does not yet call `ctx.agents.create` to build a
  long-lived dedicated seed (that would create a durable session whose
  lifecycle needs its own definition).
- **Host-level autonomous scheduling is deferred.** `dsh-schedule` is
  agent-scoped and unsuitable for a host background operator; the `intervalMs`
  ticker is a skeleton pending a host-level driver decision.
- **Probe `fetch` is host-dependent** (injectable per test; a plain global
  `fetch` is used at runtime).
- **Full GAN evaluate + notify + self-evolve are not yet wired** — the ported
  path is monitor → decide → fix → evaluate(health).

## License

MIT
