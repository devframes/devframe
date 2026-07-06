# Plan 019: Add RPC round-trip tests for the inspect plugin handlers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- plugins/inspect/src/rpc plugins/inspect/test`
> On any change since this plan was written, compare against the "Current state"
> before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (adds tests only)
- **Depends on**: plan 001 (adds the inspect `typecheck` script) is complementary but not required
- **Category**: tests
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

`@devframes/plugin-inspect` is a published plugin whose RPC handlers —
`list-functions`, `invoke`, `list-state-keys`, `describe-agent`,
`read-agent-resource`, `invoke-agent-tool` — have no direct test coverage
(existing tests cover only `dev-server`, `static-build`, `function-name`). These
are the introspection RPCs the inspector UI depends on; a round-trip test guards
them against regression. (The git plugin's `git:show` read path is already covered
by plans 004 and 014, so this plan focuses on inspect.)

## Current state

`plugins/inspect/src/rpc/functions/` defines (names verified):
- `devframes-plugin-inspect:list-functions`
- `devframes-plugin-inspect:invoke`
- `devframes-plugin-inspect:list-state-keys`
- `devframes-plugin-inspect:describe-agent`
- `devframes-plugin-inspect:read-agent-resource`
- `devframes-plugin-inspect:invoke-agent-tool`

Existing tests: `plugins/inspect/test/{dev-server,static-build,function-name}.test.ts`.
`dev-server.test.ts` already boots the inspect devframe over a real server —
**model the new tests after it** (read it first for the exact bootstrap:
server start, client creation via `createWsRpcChannel` + `createRpcClient`, and
teardown). The git plugin's `plugins/git/test/git.test.ts` shows the same
`bootRpc(port)` → `rpc.$call('name', args)` round-trip pattern.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test | `pnpm exec vitest run plugins/inspect/test` | all pass incl. new file |
| Typecheck | `pnpm --filter @devframes/plugin-inspect typecheck` | exit 0 (needs plan 001's script; else `pnpm --filter @devframes/plugin-inspect exec tsc --noEmit`) |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope** (create):
- `plugins/inspect/test/rpc.test.ts` (RPC round-trip tests)

**Out of scope**: modifying any inspect source. If a test reveals a real bug,
STOP and report it as a finding (it becomes its own fix plan).

## Git workflow

- Branch: `advisor/019-inspect-rpc-tests`.
- Commit style: `test(plugin-inspect): cover the introspection RPC handlers`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Read the existing bootstrap

Open `plugins/inspect/test/dev-server.test.ts` and copy its server-boot + client
setup (the exact helper names, imports, and teardown). Reuse the same helper
rather than inventing a new one.

### Step 2: Add round-trip tests

Cover at least:

1. **`list-functions`** returns the registered function catalog (assert it's a
   non-empty array and includes a known inspect function name, or the registered
   dummy functions the dev-server test sets up).
2. **`invoke`** calls a registered function by name+args and returns its result
   (register a simple function in the test's devframe setup — mirror how
   `dev-server.test.ts` seeds functions — then invoke it and assert the value).
3. **`list-state-keys`** returns the shared-state keys (seed one shared-state key
   and assert it appears).

If the agent surface is easy to drive in the same harness, add `describe-agent`
(returns tools/resources metadata) as a bonus; otherwise leave it for a
follow-up and say so.

**Verify**: `pnpm exec vitest run plugins/inspect/test` → all pass.

## Test plan

- New `rpc.test.ts`: `list-functions`, `invoke`, `list-state-keys` round-trips
  with meaningful assertions (real values, not just "defined").
- Existing inspect tests keep passing.
- Typecheck + lint clean.

## Done criteria

- [ ] `plugins/inspect/test/rpc.test.ts` exists with ≥3 round-trip tests asserting real values.
- [ ] `pnpm exec vitest run plugins/inspect/test` passes.
- [ ] Typecheck (`tsc --noEmit`) + `pnpm lint` exit 0.
- [ ] No inspect source modified — only the new test file.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- The inspect RPC handlers require a hub context or setup the `dev-server.test.ts`
  harness doesn't provide — report what's needed rather than building a large new
  harness.
- A handler behaves incorrectly under test — report the bug; don't weaken the
  assertion.

## Maintenance notes

- These cover the read/introspection path; the agent-tool invocation path
  (`invoke-agent-tool`) may deserve its own test once the agent surface is
  exercised elsewhere.
- Reviewer: confirm `invoke`/`list-functions` assert on actual returned data.
