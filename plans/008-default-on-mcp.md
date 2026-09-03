# Plan 008: Serve MCP by default when a devframe exposes an agent surface

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report it instead of weakening the dependency or security posture. Update this plan's row in `plans/README.md` when complete.
>
> **Drift check (run first)**: `git diff --stat f2632b2c..HEAD -- packages/devframe/src/adapters packages/devframe/src/types/devframe.ts packages/devframe/src/node packages/hub/src/node/initiate.ts packages/vite/src packages/next/src starter examples/hub-vite examples/hub-next tests/optional-mcp-bundles.test.ts docs/content`
> Stop if the MCP route options, the agent host manifest, or the plan 002 authorization contract have materially changed.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/002-authenticate-mcp-http.md`, `plans/003-enforce-mcp-state-policy.md`
- **Category**: product
- **Planned at**: commit `f2632b2c`, 2026-09-02

## Why this matters

Devframe's positioning is "one tool, two views — for the human and for the coding agent". Today the agent view takes three separate opt-ins: flag functions with `agent`, enable `cli.mcp`, and install `@modelcontextprotocol/server`. The first opt-in is the meaningful authoring decision; the other two are plumbing. Making the MCP endpoint light up automatically once an author flags their first function turns the agent view into a default feature of every devframe — while a devframe that never flags anything, and a user who sets `mcp: false`, keep paying exactly zero cost.

## Constraints this plan must not break

- **Validator neutrality of devframe's own API**: `args`/`returns` schemas stay Standard Schema-typed; devframe never asks users to author schemas in a specific validator. `@modelcontextprotocol/server` is a regular dependency of `devframe` (operator decision, 2026-09-03: MCP is a default feature, so its engine ships with the package) - its transitive `zod@4` serves the SDK internally and never surfaces in devframe's API. `@modelcontextprotocol/client` stays an optional peer, needed only by `devframe connect`.
- **Zero cost when off**: the `importRuntimeModule('devframe/adapters/mcp')` lazy load and the `tests/optional-mcp-bundles.test.ts` guard stay authoritative — `mcp: false` (and an empty agent surface) must load no MCP code and add no bundle weight.
- **Plan 002's authorization contract as landed**: a mounted route is guarded by the loopback origin gate (same-machine trust, the documented default for `mcp: true`), with `authorization` available as opt-in hardening. `'auto'` mounts with exactly the same posture as `mcp: true` — the default never grants *more* reach than the explicit setting.
- **Per-function default-deny**: the `agent` field on `defineRpcFunction` remains the only way a function reaches an agent.

> **Reconciled 2026-09-03**: this plan originally required `DEVFRAME_MCP_AUTH_TOKEN` as a third `'auto'` condition, written against plan 002's *draft* contract (mandatory bearer for `mcp: true`). Plan 002 landed with origin-only as the blessed same-machine default and `authorization` as opt-in hardening, so `'auto'` follows the same landed contract.

> **Reconciled 2026-09-03 (2)**: the plan originally kept `@modelcontextprotocol/server` an optional peer, with `DF0077` warning when a flagged surface had no SDK. The operator decided the SDK ships as a regular `dependency` of `devframe` - a default feature should not depend on an install choice - so `DF0077` and the missing-peer path were removed, and `DF0046` (the `devframe connect` diagnostic) now names the client peer, the only MCP package still optional.

## Current state

- `packages/devframe/src/types/devframe.ts` — `cli.mcp?: boolean | McpRouteOptions`, omitted means off; `McpRouteOptions.authorization` is the opt-in identity check from plan 002.
- `packages/devframe/src/adapters/initiate.ts` — mounts the route only when `mcp` is truthy, via `importRuntimeModule`.
- `packages/devframe/src/adapters/cac.ts` — tri-state `--mcp` flag (`undefined`/`true`/`false`).
- `packages/devframe/src/node/host-agent.ts` — `DevframeAgentHost` already knows whether the agent surface is non-empty (agent-flagged RPCs, `registerTool()` entries, tool providers — the hub's commands host always registers a provider, so an empty provider yield counts as no surface).
- `packages/hub/src/node/initiate.ts` — `initHub({ mcp })`, aggregate endpoint, off by default.
- `examples/hub-vite` has no MCP wiring; `examples/hub-next` does (a parity violation of the "Hub example parity" rule in `AGENTS.md`).

## Target behavior: `mcp: 'auto'` as the new default

Add `'auto'` to the `mcp` option (`McpSetting`) and make it the default where `mcp` is omitted, for both `initDevframe` and `initHub`. Under `'auto'`, the route mounts if and only if **both** hold:

1. **The agent surface is non-empty** — at least one agent-flagged RPC, `ctx.agent.registerTool()` entry, registered resource, or a provider currently yielding a tool (`DevframeAgentHost.hasSurface()`).
2. **`@modelcontextprotocol/server` resolves** as an installed peer.

The mounted route carries the same origin-only posture as `mcp: true`; `mcp: { authorization }` remains the hardening path. Condition 2 is guaranteed by `devframe`'s own `dependencies` (see the reconciliation notes), so in practice `'auto'` reduces to the surface check. When condition 1 fails, `'auto'` is silent and loads nothing: indistinguishable from today's off.

Explicit values keep today's meaning: `false` never mounts and never diagnoses; `true`/object mount unconditionally (a missing peer stays the `DF0017` startup failure — the author asked for it). The `--mcp`/`--no-mcp` tri-state flag overrides the definition as it does now, with `--no-mcp` forcing off over `'auto'`.

The product layer makes the default tangible:

- `starter/` ships `@modelcontextprotocol/server` in its `package.json` (real version, per starter conventions), an `agent`-flagged example RPC, and a README note on the two views.
- `examples/hub-next` drops its explicit `mcp: true` and `examples/hub-vite`'s README documents the aggregate endpoint — both hubs mount MCP through the `'auto'` default (their built-in plugins expose agent tools), closing the parity gap in the same PR.
- Framework kits inherit `'auto'` by forwarding an omitted `mcp` instead of coercing it to off.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Adapter tests | `pnpm exec vitest run packages/devframe/src/adapters/__tests__/initiate.test.ts packages/devframe/src/adapters/mcp/__tests__` | all tests pass |
| Hub/kit tests | `pnpm exec vitest run packages/hub/src/node/__tests__/initiate.test.ts packages/vite/test/single.test.ts packages/next/test/handler.test.ts` | all tests pass |
| Bundle guard | `pnpm exec vitest run tests/optional-mcp-bundles.test.ts` | all tests pass |
| API snapshots | `pnpm build && pnpm exec vitest run tests/exports.test.ts -u` | only intended public snapshots change |
| Full verification | `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build` | every command exits 0 |

## Scope

**In scope**:

- `packages/devframe/src/types/devframe.ts` (`'auto'` on the `mcp` union)
- `packages/devframe/src/adapters/initiate.ts`, `_shared.ts`, `cac.ts`
- `packages/devframe/src/adapters/__tests__/initiate.test.ts`
- `packages/devframe/src/node/host-agent.ts` (surface-emptiness query, if not already exposed)
- `packages/devframe/src/node/diagnostics.ts` (`DF0046` retargeted at the client peer)
- `packages/hub/src/node/initiate.ts` + `__tests__/initiate.test.ts`
- `packages/vite/src/single.ts`, `packages/vite/src/hub.ts`, `packages/next/src/handler.ts`, `packages/next/src/hub.ts` (forward omitted `mcp` as `'auto'`)
- `starter/` (SDK dependency, flagged example RPC, README)
- `examples/hub-vite` (MCP parity with `examples/hub-next`) and both hub example READMEs
- `tests/optional-mcp-bundles.test.ts` (add: `'auto'` with empty surface bundles/loads no MCP code)
- `tests/__snapshots__/tsnapi/**` (affected snapshots only)
- Docs: `1.guide/index.md`, `1.guide/15.agent-native.md`, `2.adapters/7.mcp.md`, `2.adapters/index.md`, `3.frameworks/*.md`, `8.references/4.node-api.md`, `8.references/6.hub-api.md` — positive framing ("serves MCP once you flag a function for agents"), no "opt-in" language left behind
- `plans/README.md` status row

**Out of scope**:

- Vendoring or reimplementing any part of the MCP protocol.
- Changing the authorization model (plan 002 owns it) or state exposure policy (plan 003 owns it).
- Vendoring or forking any part of the MCP SDK.
- The stdio transport and `devframe connect` (unchanged semantics).

## Git workflow

- Branch: `feat/default-on-mcp`.
- Commit style: `feat(devframe): serve MCP by default when an agent surface exists`.
- Do not push/open a PR unless instructed by the operator.

## Steps

### Step 1: Teach the option `'auto'`

Extend the `mcp` union with `'auto'` in `types/devframe.ts` and normalize the omitted case to `'auto'` in `initiate.ts` and `initHub`. Expose a cheap `hasAgentSurface()` (or equivalent) on the agent host if the manifest cannot already answer it without building tools.

**Verify**: `pnpm --filter devframe typecheck` → exit 0.

### Step 2: Implement the two-condition mount

In `initiate.ts` (and the hub aggregate), resolve `'auto'`: check surface non-emptiness first (free, no import), then load the adapter through the runtime importer (`loadAutoMcpAdapter` in `_shared.ts`). `false` and `--no-mcp` short-circuit before any check.

**Verify**: `pnpm exec vitest run packages/devframe/src/adapters/__tests__/initiate.test.ts` → all tests pass, including new cases for the matrix (empty surface / surface present / explicit `false`).

### Step 3: Keep the zero-cost guarantee provable

Extend `tests/optional-mcp-bundles.test.ts`: a bundle of an `'auto'`-defaulted devframe with an empty agent surface must contain no `@modelcontextprotocol/*` resolution, and running it must not import the MCP adapter.

**Verify**: `pnpm exec vitest run tests/optional-mcp-bundles.test.ts` → all tests pass.

### Step 4: Product layer and example parity

Update `starter/` (SDK dep, flagged RPC, README note) and bring `examples/hub-vite` to MCP parity with `examples/hub-next`: both hubs mount the aggregate route through the `'auto'` default, and both READMEs document it. Update `examples/files-inspector` to rely on the default too.

**Verify**: `pnpm exec vitest run packages/vite/test/single.test.ts examples/hub-next/tests` → all tests pass.

### Step 5: Docs and snapshots

Rewrite the scoped docs pages with positive framing per the documentation style rules: describe what mounts and when, lead with the flag-a-function flow, keep lookup details (the `'auto'` condition matrix) on the reference pages. Refresh only the intentionally-changed tsnapi snapshots.

**Verify**: `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build` → every command exits 0.

## Test plan

- Omitted `mcp` + empty surface → no route, no import, no diagnostic.
- Omitted `mcp` + flagged RPC → route mounts (origin-only, same as `mcp: true`).
- `mcp: false` / `--no-mcp` + flagged RPC → no route, no diagnostic.
- Hub aggregate under `'auto'` → mounts only when at least one mounted devframe has a non-empty surface; `DF8005` fires only under explicit `mcp: false`.
- Bundle guard: `'auto'` + empty surface bundles clean and mounts nothing at runtime.

## Done criteria

- [x] Omitting `mcp` serves the agent view exactly when a surface exists and the SDK resolves.
- [x] `mcp: false` and empty-surface `'auto'` load zero MCP code, proven by the bundle guard.
- [x] `@modelcontextprotocol/server` ships as a `devframe` dependency (the default feature's engine); `@modelcontextprotocol/client` remains an optional peer for `devframe connect`; devframe's authored API stays validator-neutral.
- [x] `'auto'` mounts with exactly `mcp: true`'s posture (origin gate; `authorization` opt-in) — the default grants no extra reach.
- [x] Starter demonstrates the flag-a-function flow out of the box; hub examples are at MCP parity.
- [x] Docs describe the default flow positively; lookup details live on the reference pages.
- [x] Full verification passes; only in-scope files and `plans/README.md` changed.

## STOP conditions

- Plan 002 or 003 has not landed (`plans/README.md` rows not DONE).
- The `'auto'` check cannot determine surface non-emptiness without importing the MCP adapter or SDK.
- `'auto'` would need to mount with a *weaker* posture than `mcp: true` (e.g. a disabled origin gate) to be useful.
- API snapshot changes include unrelated exports.

## Maintenance notes

Every future transport or kit that gains an `mcp` option must route the omitted case through the same `'auto'` resolution (`loadAutoMcpAdapter`) rather than re-inventing a default. Reviewers should check that new built-in devframes flag functions deliberately — under `'auto'`, an `agent` field is what turns the endpoint on.
