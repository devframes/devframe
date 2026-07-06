# Plan 016: Harden the code-server supervisor (loopback bind default + folder guard)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- plugins/code-server/src/node/supervisor.ts plugins/code-server/src/types.ts`
> On any change since this plan was written, compare against the "Current state"
> excerpts before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — **contains a ⚠️ BREAKING default change** (bind host)
- **Depends on**: plan 003 (WS origin check) mitigates the reachability of the cookie disclosure noted below
- **Category**: security
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

The code-server supervisor spawns a full browser IDE (file access + integrated
terminal). Two hardening gaps:

1. **Binds `0.0.0.0` by default** — the IDE is exposed to the whole LAN unless the
   author overrides `host`. A local dev tool should default to loopback.
2. **Client `folder` is appended as the last code-server arg with no guard**
   (`req.folder`, also `agent`-exposed). A value beginning with `-` is parsed as a
   code-server flag; a later flag could override the server's own `--auth`/
   `--bind-addr`. It should be validated to an existing directory.

A third issue — `status()` returning the session cookie (`HASHED_PASSWORD`) to
any RPC caller — is real but is gated by the same origin/auth reachability that
plan 003 (WS origin check) and plan 031 (auth enforcement) address; this plan
notes it and recommends gating the cookie once trust enforcement lands, rather
than half-fixing it here.

## Current state

`plugins/code-server/src/node/supervisor.ts`:

- `:106` `this.host = options.host ?? '0.0.0.0'`
- `:169-170` `'--bind-addr', ` `${this.host}:${initialPort}` ``
- `:165` `const folder = req.folder ?? this.workspace`
- `:166-176` — args, ending with `...this.extraArgs, folder,` (folder is the last positional, unguarded)
- `:311-315` `authInfo()` returns `{ cookieName, cookieValue }` — the cookie disclosure (leave as noted).

`plugins/code-server/src/types.ts:78-79`:
```ts
/** Host code-server binds to. Defaults to `0.0.0.0` so the preview is reachable. */
host?: string
```

`CodeServerStartRequest.folder` feeds `req.folder`. Test file:
`plugins/code-server/test/code-server.test.ts` (tests skip when the `code-server`
binary is absent).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test | `pnpm exec vitest run plugins/code-server/test/code-server.test.ts` | all pass |
| Typecheck | `pnpm --filter @devframes/plugin-code-server typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `plugins/code-server/src/node/supervisor.ts` (default host; extract + use a `resolveFolder` guard)
- `plugins/code-server/src/types.ts` (update the `host` doc comment)
- `plugins/code-server/test/code-server.test.ts` (unit-test the folder guard)

**Out of scope**: the `status()` cookie disclosure (needs trust enforcement —
plan 031) and the Windows `.cmd` `shell:true` spawn (leave as-is; changing it
risks Windows breakage). Do not touch the SPA/client.

## Git workflow

- Branch: `advisor/016-code-server-hardening`.
- Commit style: `fix(plugin-code-server)!: default to loopback bind and validate the workspace folder` (the `!` marks the breaking default).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Default the bind host to loopback ⚠️

`supervisor.ts:106` → `this.host = options.host ?? '127.0.0.1'`.
Update the doc in `types.ts:78`:
```ts
/** Host code-server binds to. Defaults to `127.0.0.1` (loopback). Set to `0.0.0.0` to expose the preview on your LAN. */
host?: string
```

### Step 2: Extract and enforce a folder guard

Add a small, testable pure helper (module-level, exported for the test):

```ts
import { existsSync, statSync } from 'node:fs'

/**
 * Resolve the workspace folder to open. A client-supplied folder must be an
 * existing directory that doesn't parse as a code-server option; otherwise fall
 * back to the trusted default workspace.
 */
export function resolveCodeServerFolder(reqFolder: string | undefined, workspace: string): string {
  if (!reqFolder || reqFolder.startsWith('-'))
    return workspace
  try {
    if (existsSync(reqFolder) && statSync(reqFolder).isDirectory())
      return reqFolder
  }
  catch {}
  return workspace
}
```

Use it in `start()` (replace `:165`): `const folder = resolveCodeServerFolder(req.folder, this.workspace)`.
Optionally add `'--'` before the folder positional in the args array as
defense-in-depth (`...this.extraArgs, '--', folder`) — verify code-server accepts
`-- <folder>` before adopting it; if unsure, the `resolveCodeServerFolder` guard
alone is sufficient.

### Step 3: Test the guard

Add to `code-server.test.ts` (these are pure-function tests — no binary needed):

```ts
import { resolveCodeServerFolder } from '../src/node/supervisor'

it('resolveCodeServerFolder rejects dashed and non-existent folders', () => {
  const ws = process.cwd()
  expect(resolveCodeServerFolder('--auth=none', ws)).toBe(ws)         // dashed → fallback
  expect(resolveCodeServerFolder('/no/such/dir/xyz', ws)).toBe(ws)    // missing → fallback
  expect(resolveCodeServerFolder(ws, '/fallback')).toBe(ws)           // valid dir → used
  expect(resolveCodeServerFolder(undefined, ws)).toBe(ws)             // absent → workspace
})
```

**Verify**: `pnpm exec vitest run plugins/code-server/test/code-server.test.ts`
→ all pass.

## Test plan

- New: `resolveCodeServerFolder` returns the workspace for dashed/missing/absent
  input and the folder for a real directory.
- Existing code-server tests keep passing (they skip without the binary).
- `pnpm --filter @devframes/plugin-code-server typecheck` + `pnpm lint` clean.

## Done criteria

- [ ] Default bind host is `127.0.0.1`; `types.ts` doc updated.
- [ ] `resolveCodeServerFolder` exists, is used in `start()`, and is unit-tested.
- [ ] New test passes; existing code-server tests pass.
- [ ] `pnpm --filter @devframes/plugin-code-server typecheck` + `pnpm lint` exit 0.
- [ ] Only the 3 in-scope files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- An example/doc relies on the `0.0.0.0` default for LAN preview — surface it so
  the breaking change is documented (users must set `host: '0.0.0.0'`).
- code-server rejects `-- <folder>` (then skip the `--` and rely on the validation guard).

## Maintenance notes

- **Breaking**: the LAN-reachable default is gone; document in the PR + plugin
  docs that `host: '0.0.0.0'` re-enables it.
- **Follow-up (deferred)**: gate `status()`'s cookie behind a trusted session
  once plan 031 lands — until then plan 003's origin check is the mitigation.
- Reviewer: confirm no client-controlled value reaches the code-server argv
  without validation.
