# Plan 003: Enforce shared-state exposure policy on direct MCP reads

> **Executor instructions**: Follow this plan step by step and run each verification command. Stop on a listed STOP condition. Update this plan's status row in `plans/README.md` when complete unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 2d978f84..HEAD -- packages/devframe/src/adapters/mcp/build-server.ts packages/devframe/src/adapters/mcp/__tests__/mcp-server.test.ts`
> Stop if shared-state resource registration has materially changed.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/002-authenticate-mcp-http.md`
- **Category**: security
- **Planned at**: commit `2d978f84`, 2026-09-01

## Why this matters

MCP resource listing honors `exposeSharedState`, but direct `devframe://state/<key>` reads do not. A caller that knows a filtered key can bypass the policy. One shared predicate must govern listing, the built-in read tool, and direct resource reads.

## Current state

`packages/devframe/src/adapters/mcp/build-server.ts:202-205` already centralizes policy conversion:

```ts
function sharedStateFilter(exposeSharedState: boolean | ((key: string) => boolean)) {
  if (exposeSharedState === false)
    return undefined
  return typeof exposeSharedState === 'function' ? exposeSharedState : () => true
}
```

The list path applies the predicate at lines 343-355, while the direct read at lines 377-385 calls `ctx.rpc.sharedState.get(parsed.key)` without checking it. `readStateResult` at lines 230-241 demonstrates the existing deny behavior and coded diagnostic `DF0048`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Targeted test | `pnpm exec vitest run packages/devframe/src/adapters/mcp/__tests__/mcp-server.test.ts` | all tests pass |
| Typecheck | `pnpm --filter devframe typecheck` | exit 0 |
| Full verification | `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build` | every command exits 0 |

## Scope

**In scope**:

- `packages/devframe/src/adapters/mcp/build-server.ts`
- `packages/devframe/src/adapters/mcp/__tests__/mcp-server.test.ts`

**Out of scope**:

- MCP HTTP authentication from Plan 002.
- Changing default `exposeSharedState` values at adapter call sites.
- Filtering registered agent resources; this finding concerns shared-state projections only.
- New diagnostics unless existing `DF0048` cannot represent the denial.

## Git workflow

- Work in the assigned worktree; branch if needed: `fix/mcp-state-policy`.
- Commit style: `fix(devframe): enforce MCP state exposure policy`.
- Do not push/open a PR unless instructed.

## Steps

### Step 1: Reuse one predicate in resource handlers

Resolve `sharedStateFilter(exposeSharedState)` once inside `registerResourceHandlers`. Use it for both list and read. For `parsed.kind === 'state'`, reject when the predicate is absent or returns false before calling `sharedState.get`. Match the existing `DF0048` denial used by `readStateResult`.

Do not silently return an empty value and do not reveal whether a denied key exists.

**Verify**: `pnpm --filter devframe typecheck` -> exit 0.

### Step 2: Add bypass regression tests

Generalize the `bootPair` test helper so tests can supply `exposeSharedState`. Add cases proving:

- `false` omits state resources and rejects a direct URI read.
- A predicate lists/reads allowed keys and rejects a known denied key by direct URI.
- `true` retains current list/read behavior.
- The built-in state-read tool and resource path agree for the same policy.

Use opaque key names; do not embed sensitive-looking values in tests.

**Verify**: `pnpm exec vitest run packages/devframe/src/adapters/mcp/__tests__/mcp-server.test.ts` -> all tests pass.

## Test plan

Model new tests after `mcp-server.test.ts:234-255`. Assert both listing and direct reads, since testing only the list would miss the vulnerability.

## Done criteria

- [ ] One predicate controls every shared-state MCP projection.
- [ ] Denied direct reads fail before storage access.
- [ ] Tests cover `false`, predicate allow/deny, and `true`.
- [ ] Targeted test and typecheck pass.
- [ ] Full repository verification passes.
- [ ] Only in-scope files and `plans/README.md` changed.

## STOP conditions

- Plan 002 changed the resource registration architecture enough that the excerpts no longer match.
- A denied read cannot use `DF0048` without exposing key existence; report before adding an ad-hoc error.
- Registered non-state resources unexpectedly depend on `exposeSharedState`.

## Maintenance notes

Any future shared-state transport must apply the exposure predicate at the read operation, not only during discovery. Reviewers should search for all `parsed.kind === 'state'` and `sharedState.get` calls in the MCP adapter.
