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

- **Validator neutrality**: `@modelcontextprotocol/server@2` depends on `zod@4` via `@modelcontextprotocol/core`. The SDK must stay an **optional peer** of `devframe`; it never enters runtime `dependencies`.
- **Zero cost when off**: the `importRuntimeModule('devframe/adapters/mcp')` lazy load and the `tests/optional-mcp-bundles.test.ts` guard stay authoritative — `mcp: false` (and an empty agent surface) must load no MCP code and add no bundle weight.
- **Plan 002's authorization contract**: no route mounts without an explicit authorization policy or the `DEVFRAME_MCP_AUTH_TOKEN` bearer. Default-on never means unauthenticated-on.
- **Per-function default-deny**: the `agent` field on `defineRpcFunction` remains the only way a function reaches an agent.

## Current state

- `packages/devframe/src/types/devframe.ts` — `cli.mcp?: boolean | McpRouteOptions`, omitted means off.
- `packages/devframe/src/adapters/initiate.ts` — mounts the route only when `mcp` is truthy, via `importRuntimeModule`.
- `packages/devframe/src/adapters/cac.ts` — tri-state `--mcp` flag (`undefined`/`true`/`false`).
- `packages/devframe/src/node/host-agent.ts` — `DevframeAgentHost` already knows whether the agent surface is non-empty (agent-flagged RPCs, `registerTool()` entries, tool providers).
- `packages/hub/src/node/initiate.ts` — `initHub({ mcp })`, aggregate endpoint, off by default.
- After plan 002: `mcp: true` requires `DEVFRAME_MCP_AUTH_TOKEN` (or an explicit `authorization` policy) and the Next hub kit defaults to disabled.
- `examples/hub-vite` has no MCP wiring; `examples/hub-next` does (a parity violation of the "Hub example parity" rule in `AGENTS.md`).

## Target behavior: `mcp: 'auto'` as the new default

Add `'auto'` to the `mcp` option and make it the default where `mcp` is omitted, for both `initDevframe` and `initHub`. Under `'auto'`, the route mounts if and only if **all three** hold:

1. **The agent surface is non-empty** — at least one agent-flagged RPC, `ctx.agent.registerTool()` entry, or registered tool provider.
2. **`@modelcontextprotocol/server` resolves** as an installed peer.
3. **An authorization policy is available** — `DEVFRAME_MCP_AUTH_TOKEN` is set (plan 002's shorthand path). `'auto'` never mounts with `authorization: false`.

When condition 1 holds but 2 or 3 fails, emit **one** structured diagnostic (new sequential `DF00xx`, `method: 'warn'`, deduplicated per process) naming the single missing piece — "install `@modelcontextprotocol/server`" or "set `DEVFRAME_MCP_AUTH_TOKEN`" — so the author discovers the agent view exists. When condition 1 fails, `'auto'` is silent and loads nothing: indistinguishable from today's off.

Explicit values keep today's meaning: `false` never mounts and never diagnoses; `true`/object follow plan 002's contract exactly (missing token on explicit `true` stays a coded startup failure — the author asked for it). The `--mcp`/`--no-mcp` tri-state flag overrides the definition as it does now, with `--no-mcp` forcing off over `'auto'`.

The product layer makes the default tangible:

- `starter/` ships `@modelcontextprotocol/server` in its `package.json` (real version, per starter conventions), an `agent`-flagged example RPC, and a README line about `DEVFRAME_MCP_AUTH_TOKEN`.
- `examples/hub-vite` gains aggregate-MCP wiring matching `examples/hub-next` (explicit env-backed authorization in both), closing the parity gap in the same PR.
- Framework kits inherit `'auto'` by forwarding an omitted `mcp` instead of coercing it to off; `@devframes/next/hub` keeps plan 002's explicit-opt-in stance only if 002 landed it that way — otherwise it adopts `'auto'` like the rest.

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
- `packages/devframe/src/node/diagnostics.ts` + one new `docs/content/6.errors/DF00xx.md`
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
- Moving `@modelcontextprotocol/*` out of `peerDependencies`.
- The stdio transport and `devframe connect` (unchanged semantics).

## Git workflow

- Branch: `feat/default-on-mcp`.
- Commit style: `feat(devframe): serve MCP by default when an agent surface exists`.
- Do not push/open a PR unless instructed by the operator.

## Steps

### Step 1: Teach the option `'auto'`

Extend the `mcp` union with `'auto'` in `types/devframe.ts` and normalize the omitted case to `'auto'` in `initiate.ts` and `initHub`. Expose a cheap `hasAgentSurface()` (or equivalent) on the agent host if the manifest cannot already answer it without building tools.

**Verify**: `pnpm --filter devframe typecheck` → exit 0.

### Step 2: Implement the three-condition mount

In `initiate.ts` (and the hub aggregate), resolve `'auto'`: check surface non-emptiness first (free, no import), then attempt the runtime SDK import, then the plan 002 authorization resolution. Mount only when all three pass; emit the new deduplicated diagnostic when only the surface condition passes. `false` and `--no-mcp` short-circuit before any check.

**Verify**: `pnpm exec vitest run packages/devframe/src/adapters/__tests__/initiate.test.ts` → all tests pass, including new cases for each cell of the matrix (empty surface / missing SDK / missing token / all present).

### Step 3: Keep the zero-cost guarantee provable

Extend `tests/optional-mcp-bundles.test.ts`: a bundle of an `'auto'`-defaulted devframe with an empty agent surface must contain no `@modelcontextprotocol/*` resolution, and running it must not import the MCP adapter.

**Verify**: `pnpm exec vitest run tests/optional-mcp-bundles.test.ts` → all tests pass.

### Step 4: Product layer and example parity

Update `starter/` (SDK dep — synced by `scripts/sync-starter-version.ts` conventions — flagged RPC, README token note) and bring `examples/hub-vite` to MCP parity with `examples/hub-next`, both using explicit env-backed authorization per plan 002. Update both example READMEs in the same change.

**Verify**: `pnpm exec vitest run packages/vite/test/single.test.ts examples/hub-next/tests` → all tests pass.

### Step 5: Docs and snapshots

Rewrite the scoped docs pages with positive framing per the documentation style rules: describe what mounts and when, lead with the flag-a-function flow, keep lookup details (the `'auto'` condition matrix) on the reference pages. Refresh only the intentionally-changed tsnapi snapshots.

**Verify**: `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build` → every command exits 0.

## Test plan

- Omitted `mcp` + empty surface → no route, no import, no diagnostic.
- Omitted `mcp` + flagged RPC + SDK + token → route mounts, bearer required.
- Omitted `mcp` + flagged RPC, SDK missing → no route, one warn diagnostic naming the SDK.
- Omitted `mcp` + flagged RPC + SDK, token missing → no route, one warn diagnostic naming the env var.
- `mcp: false` / `--no-mcp` + flagged RPC → no route, no diagnostic.
- Explicit `mcp: true`, token missing → plan 002's coded startup failure (unchanged).
- Hub aggregate under `'auto'` → mounts only when at least one mounted devframe has a non-empty surface and conditions 2–3 hold.
- Bundle guard: `'auto'` + empty surface bundles clean.

## Done criteria

- [ ] Omitting `mcp` serves the agent view exactly when a surface exists, the SDK resolves, and authorization is configured.
- [ ] `mcp: false` and empty-surface `'auto'` load zero MCP code, proven by the bundle guard.
- [ ] `@modelcontextprotocol/*` remain optional peers of `devframe`; no workspace package gains them as runtime dependencies.
- [ ] `'auto'` never mounts an unauthenticated route.
- [ ] Starter demonstrates the flag-a-function flow out of the box; hub examples are at MCP parity.
- [ ] Docs contain no "opt-in"/"optional peer" framing for the default flow; the condition matrix lives on a reference page.
- [ ] Full verification passes; only in-scope files and `plans/README.md` changed.

## STOP conditions

- Plan 002 or 003 has not landed (`plans/README.md` rows not DONE).
- The `'auto'` check cannot determine surface non-emptiness without importing the MCP adapter or SDK.
- Satisfying `'auto'` would require moving `@modelcontextprotocol/*` into runtime `dependencies` or otherwise introducing `zod` as a devframe dependency.
- The authorization contract from plan 002 would need loosening (e.g. `'auto'` mounting with `authorization: false`) to make the default useful.
- API snapshot changes include unrelated exports.

## Maintenance notes

Every future transport or kit that gains an `mcp` option must route the omitted case through the same `'auto'` resolution rather than re-inventing a default. Reviewers should check that new built-in devframes flag functions deliberately — under `'auto'`, an `agent` field is what turns the endpoint on for users with a token configured.
