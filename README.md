# dsh-waom

> **Autonomous ops for DeepSeek Harness.** Watch a target, decide a fix, drive a DSH subagent to implement it, and verify the result — **without shelling out to `claude -p`**.

[![npm version](https://img.shields.io/npm/v/@shizhanyu13/dsh-waom?style=flat-square)](https://www.npmjs.com/package/@shizhanyu13/dsh-waom)
[![npm downloads](https://img.shields.io/npm/dm/@shizhanyu13/dsh-waom?style=flat-square)](https://www.npmjs.com/package/@shizhanyu13/dsh-waom)
[![License: MIT](https://img.shields.io/badge/license-MIT-brightgreen)](/LICENSE)
[![dsh-plugin](https://img.shields.io/badge/dsh-plugin-topic-blue?logo=github)](https://github.com/topics/dsh-plugin)
[![ESM](https://img.shields.io/badge/module-ESM-purple)](/package.json)
[![Status: community port](https://img.shields.io/badge/status-community%20port%2C%20not%20official-orange)](#why-this-exists)
[![Self-contained](https://img.shields.io/badge/deps-0%20runtime-brightgreen)](/package.json)

> 🚀 **Install:** `npm install @shizhanyu13/dsh-waom` — then wire it into `cordis.patch.yml` (see Quickstart below).

---

## Why this exists

Services go down. The classic WAOM loop — *Watch, Assess, Operate, Maintain* — says: detect it, fix it, verify. Old orchestrators do that by calling an external CLI (`claude -p`), which ties you to a subprocess you don't control.

`dsh-waom` does the same loop **inside DSH**. It probes a target, decides a fix, launches a real **DSH subagent** (via `ctx.subagents.start`) to write the fix, and evaluates the target independently afterward (a GAN-style *generator → verifier* split). No subprocess, no `claude -p` — the fix runs as a first-class DSH agent with the host's own tools and context.

> **Provenance & trust:** this is a **community-maintained port**, not an official DeepSeek AI package. It is the execution-layer rewrite of `scripts/waom/waom-orchestrator.py`. Targets the DSH plugin system (`dsh-plugin`). Use at your own discretion — and open an issue if something's off.

---

## Quickstart

```sh
npm install @shizhanyu13/dsh-waom
```

Add the plugin to a profile's `cordis.patch.yml`:

```yaml
- id: waom
  name: '@shizhanyu13/dsh-waom'
  config:
    subagentProvider: spawn     # default 'spawn'
    intervalMs: 0               # 0 -> manual only (no host ticker)
    seedSessionId: ''           # '' -> adopt a live root agent
    surgicalConstraints: []     # extra constraints appended to the fix prompt
    monitors:
      - { id: my-service, url: https://your/health, fixable: true }
```

The package ships a **self-contained prebuilt ESM bundle** — 0 runtime deps, no build step. It needs a DSH host that provides the peer `@deepseek-ai/*` packages.

---

## What it does

A single cycle (`waom.run`) is the whole loop:

1. **Probe** the monitor target (HTTP `HEAD`).
2. **Decide** — a `heuristicDecide` fallback when no LLM route is wired (down → `needs_fix`).
3. **Drive a fix subagent** — `ctx.subagents.start(provider, request)` with a real `ContentBlock[]` prompt; the subagent's **parent is resolved internally** (`resolveParent`), not passed in by the caller.
4. **Evaluate independently** — PASS only when the target is healthy *after* the fix (`evaluate`).

### Example

```ts
const waom = ctx.get('waom')
const result = await waom.run({ id: 'svc', url: 'https://your/health', fixable: true })
// { monitor: 'svc', healthy: true, decision: { needs_fix: true, action: 'fix' },
//   fix: <subagent result>, evaluation: { passed: true, reason: 'target healthy after fix' } }
```

---

## Configuration

| field | default | meaning |
|---|---|---|
| `monitors` | `[]` | targets to watch; each has `id`, `url`, `healthyCode` (200), `fixable` (false) |
| `intervalMs` | `0` | host ticker period in ms; `0` = manual only |
| `subagentProvider` | `'spawn'` | provider used to start the fix subagent |
| `surgicalConstraints` | `[]` | constraints appended to the fix prompt |
| `seedSessionId` | `''` | optional session whose agent becomes the seed parent |

---

## Default behavior

- **Inert by default** — `intervalMs: 0` and no `monitors` means nothing runs. It only provides the `waom` service a profile may drive on demand.
- It's a **service, not a tool** — never appears in the model's tool catalog, no request-cache effect.

---

## Known limitations

- **Auto-creating a dedicated seed parent is deferred.** `resolveParent` maps a configured `seedSessionId` to its live agent, falls back to a live root agent, or fails loud — it does not yet call `ctx.agents.create` for a long-lived dedicated seed.
- **Host-level autonomous scheduling is deferred.** `dsh-schedule` is agent-scoped; the `intervalMs` ticker is a skeleton pending a host-level driver decision.
- **Probe `fetch` is host-dependent** (injectable for tests; a plain global `fetch` at runtime).
- **Full GAN evaluate + notify + self-evolve are not yet wired** — the ported path is monitor → decide → fix → evaluate(health).

---

## Community & contribution

- Discoverability: tag your plugin repo with the [`dsh-plugin` topic](https://github.com/topics/dsh-plugin) so the community can find it.
- **Upstream PRs**: DSH does not currently accept external pull requests, so this is delivered as an independent plugin rather than a patch to `deepseek-ai/deepseek-harness`.
- Feedback, bug reports, feature ideas: open an issue, or start a discussion.

---

## License

MIT
