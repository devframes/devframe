# Plan 030 (spike): Design server-side auth enforcement for the RPC surface

> **Executor instructions**: This is a **design/spike** plan. Produce a written
> design + a prototype behind a flag; do NOT flip enforcement on by default in
> this plan. If a STOP condition occurs, stop and report. When done, update this
> plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- packages/devframe/src/node/server.ts packages/devframe/src/node/auth packages/devframe/src/rpc/transports/ws-server.ts packages/devframe/src/node/hub-internals/context.ts`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P2 (design), but the eventual change is **⚠️ BREAKING**
- **Effort**: L
- **Risk**: HIGH (turning on enforcement breaks clients that connect with no handshake)
- **Depends on**: plan 003 (WS origin check — the non-breaking mitigation) should land first; plan 007 (auth tests) and plan 015 (token store) are the safety net
- **Category**: security
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

A full auth/OTP/trust/origin-lock subsystem exists (sound crypto in
`crypto-token.ts`, TTL + lockout + rotation in `auth/state.ts`) but **nothing
enforces it server-side**: `session.meta.isTrusted` is only ever *written*, never
read to gate a call; `exchangeTempAuthCode`/`verifyAuthToken`/`isRemoteTokenTrusted`
have no in-repo callers; and the built-in git/code-server CLIs ship `auth:false`.
This is **partly by design** — `node/server.ts:103-104` documents that devframe
"defers auth to its host adapters; the standalone CLI server is unauthenticated."
But combined with the missing WS origin check (plan 003), the standalone `npx`
tools are reachable by any web page. This spike designs *optional, opt-in*
enforcement so the primitives can actually gate access when a tool wants it —
without breaking the deliberate "host adapter owns auth" model.

## Current state

- Resolver (no auth gate): `packages/devframe/src/node/server.ts:105-118`.
- `auth:false` auto-trust stub: `server.ts:154-165` (registers a noop
  `devframe:anonymous:auth` returning `{ isTrusted: true }`).
- `_authDisabled` set but never read: `server.ts:146`.
- Trust primitives with no callers: `auth/state.ts:67` (`verifyAuthToken`),
  `:92` (`exchangeTempAuthCode`); `hub-internals/context.ts:97`
  (`isRemoteTokenTrusted`).
- The client already calls `devframe:anonymous:auth` / `devframe:auth:exchange`
  on connect (`client/rpc-ws.ts:162,178`); the real handlers are expected from
  host adapters (`types/rpc-augments.ts:66`).
- Remote-dock tokens are minted (`hub/src/node/host-docks.ts` via
  `allocateRemoteToken`) but `isRemoteTokenTrusted` is never checked on the WS
  upgrade.

## Scope

**In scope** (spike deliverables):
- A written design doc (`plans/notes/auth-enforcement-design.md` or PR body):
  1. **The authz contract** — e.g. a per-RPC-function `trusted` / `public` flag on
     `RpcFunctionDefinition` (default-deny for non-public functions when
     enforcement is on), OR a resolver-level gate that consults
     `session.meta.isTrusted`. Weigh both; recommend one.
  2. **Where the gate lives** — the `server.ts` resolver rejecting untrusted
     sessions for non-public functions.
  3. **Registering the real handlers** — wire `devframe:auth:exchange` /
     `devframe:anonymous:auth` onto the existing `exchangeTempAuthCode` /
     `verifyAuthToken` primitives (behind an `auth`-enabled path, not the
     `auth:false` stub).
  4. **Remote docks** — call `isRemoteTokenTrusted(token, origin)` during the WS
     upgrade for remote-dock connections.
  5. **Compatibility/opt-out** — how tools keep `auth:false`; migration for the
     built-in CLIs; how host adapters (e.g. `@vitejs/devtools`) coexist.
- A **prototype behind a flag** (enforcement OFF by default): implement the
  resolver gate + real-handler registration so a test can turn it on and prove a
  non-trusted call is rejected while a trusted one succeeds. Do NOT change the
  default behavior of any shipped CLI in this plan.

**Out of scope**: flipping enforcement on by default (that's a follow-up,
coordinated + documented as breaking); encrypting the token store (plan 015).

## Steps

1. Read the current auth flow end to end (files above) and `docs/guide/security.md`
   (the stated security posture) so the design stays consistent with documented intent.
2. Draft the authz contract + gate design; recommend one option with rationale.
3. Prototype: add an opt-in enforcement path (e.g. `auth: true` actually wires the
   real handlers + resolver gate; a per-function `public: true` marks handshake
   functions and other intentionally-open endpoints). Keep it OFF unless opted in.
4. Add tests: with enforcement enabled, an untrusted session's call to a
   non-public function is rejected; after `exchangeTempAuthCode`/`verifyAuthToken`,
   the same call succeeds. Reuse plan 007's harness.
5. Write the migration/compat section (built-in CLIs, host adapters, remote docks)
   and the list of functions that must be `public` (the auth handshake itself,
   `__connection.json`, etc.).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Test | `pnpm exec vitest run packages/devframe/src/node` | all pass incl. gated cases |
| Typecheck | `pnpm --filter devframe typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Done criteria

- [ ] A design doc covering: authz contract, gate location, real-handler wiring, remote-dock origin-lock, and compat/opt-out.
- [ ] A prototype enforcement path exists, **off by default**, that a test can enable.
- [ ] Tests prove: untrusted → rejected, trusted → allowed, when enforcement is enabled; default behavior unchanged when it isn't.
- [ ] `pnpm --filter devframe typecheck` + `pnpm lint` + node tests pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:
- The design would force a breaking change on host adapters (e.g. `@vitejs/devtools`)
  that can't be made opt-in — surface it; the whole point is optional enforcement.
- The set of must-be-public functions is larger/subtler than expected — enumerate
  it in the design rather than guessing.

## Maintenance notes

- Enabling enforcement by default is a **separate, breaking** follow-up requiring
  coordination with host adapters and a major-version note. This plan only makes
  it *possible* and *tested*.
- Plan 003 (origin check) is the immediate, non-breaking mitigation and should
  ship regardless of this spike's outcome.
- Reviewer: confirm nothing here changes a shipped tool's default auth behavior.
