# Plan 005: Don't permanently cache a rejected RPC `setup()` promise

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- packages/devframe/src/rpc/handler.ts`
> On any change since this plan was written, compare against the "Current state"
> excerpt before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (only changes the failure path)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

`getRpcResolvedSetupResult` memoizes an RPC function's `setup()` promise so a
single module-level definition can serve multiple contexts. But it caches the
promise unconditionally — if `setup()` rejects (a transient I/O failure, a
not-yet-ready dependency), the **rejected** promise is cached forever. Every
later call to that function re-awaits the same cached rejection, so one transient
failure bricks the RPC function for the life of the process (or, with the
WeakMap, for that context) with no retry short of a restart.

## Current state

`packages/devframe/src/rpc/handler.ts:18-34`:

```ts
if (typeof context === 'object' && context !== null) {
  definition.__cache ??= new WeakMap()
  let promise = definition.__cache.get(context as object)
  if (!promise) {
    promise = Promise.resolve(definition.setup(context))
    definition.__cache.set(context as object, promise)
  }
  return await promise
}

// Primitive / undefined context — fall back to a single-slot cache.
definition.__promise ??= Promise.resolve(definition.setup(context))
return await definition.__promise
```

Both branches store the promise before it settles and never evict it on
rejection. `getRpcResolvedSetupResult` is exported from this module and called by
`getRpcHandler` (`handler.ts:50`). There is no `handler.test.ts` today.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test (new file) | `pnpm exec vitest run packages/devframe/src/rpc/handler.test.ts` | all pass |
| Typecheck | `pnpm --filter devframe typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `packages/devframe/src/rpc/handler.ts` (evict the cache entry on rejection)
- `packages/devframe/src/rpc/handler.test.ts` (create)

**Out of scope**: everything else. Do not change the success-path caching
semantics (a resolved setup must still be cached and reused per-context).

## Git workflow

- Branch: `advisor/005-setup-cache-rejection`.
- Commit style: `fix(rpc): re-run setup after a rejected setup() instead of caching the rejection`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Evict on rejection in both branches

Attach a `.catch` that removes the cache entry so the next call re-runs `setup()`.
Target shape (object-context branch):

```ts
if (!promise) {
  promise = Promise.resolve(definition.setup(context))
  // If setup rejects, evict so a later call can retry instead of re-awaiting
  // the cached rejection permanently.
  promise.catch(() => {
    if (definition.__cache?.get(context as object) === promise)
      definition.__cache.delete(context as object)
  })
  definition.__cache.set(context as object, promise)
}
return await promise
```

Primitive/undefined branch (single-slot `__promise`):

```ts
if (!definition.__promise) {
  const promise = Promise.resolve(definition.setup(context))
  promise.catch(() => {
    if (definition.__promise === promise)
      definition.__promise = undefined
  })
  definition.__promise = promise
}
return await definition.__promise
```

Note the identity check (`=== promise`) so a retry already in flight isn't
clobbered. Do not swallow the rejection for the awaiting caller — `return await
promise` must still throw on that first call.

### Step 2: Test

Create `handler.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { defineRpcFunction } from './define'
import { getRpcResolvedSetupResult } from './handler'

describe('getRpcResolvedSetupResult', () => {
  it('retries setup after a rejection instead of caching it (object context)', async () => {
    let calls = 0
    const def = defineRpcFunction({
      name: 't:retry',
      type: 'query',
      setup: () => {
        calls++
        if (calls === 1)
          throw new Error('transient')
        return { handler: () => 'ok' }
      },
    })
    const ctx = {}
    await expect(getRpcResolvedSetupResult(def as any, ctx)).rejects.toThrow('transient')
    const result = await getRpcResolvedSetupResult(def as any, ctx)
    expect(result.handler?.()).toBe('ok')
    expect(calls).toBe(2)
  })

  it('caches a successful setup result per context (no re-run)', async () => {
    let calls = 0
    const def = defineRpcFunction({
      name: 't:cache',
      type: 'query',
      setup: () => {
        calls++
        return { handler: () => calls }
      },
    })
    const ctx = {}
    await getRpcResolvedSetupResult(def as any, ctx)
    await getRpcResolvedSetupResult(def as any, ctx)
    expect(calls).toBe(1)
  })
})
```

Adjust the `as any` casts / import path only if the compiler requires it; the
behavior asserted is what matters.

**Verify**: `pnpm exec vitest run packages/devframe/src/rpc/handler.test.ts` → both pass.

## Test plan

- New `handler.test.ts`: (1) a setup that throws once then succeeds resolves on
  the 2nd call (`calls === 2`); (2) a successful setup is cached (`calls === 1`).
- `pnpm --filter devframe typecheck` + `pnpm lint` clean.
- Run the broader rpc suite to ensure no regression:
  `pnpm exec vitest run packages/devframe/src/rpc` → all pass.

## Done criteria

- [ ] Both cache branches in `handler.ts` evict the entry when the setup promise rejects.
- [ ] The first (rejecting) call still throws to its caller.
- [ ] `handler.test.ts` exists and both cases pass.
- [ ] `pnpm exec vitest run packages/devframe/src/rpc` passes.
- [ ] `pnpm --filter devframe typecheck` + `pnpm lint` exit 0.
- [ ] Only the 2 in-scope files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Evicting on rejection breaks an existing rpc test that relied on a setup being
  called exactly once even after throwing (unlikely — report it).
- `getRpcResolvedSetupResult` isn't importable directly (adjust to test through
  `getRpcHandler`, and say so).

## Maintenance notes

- The retry re-runs `setup()` on the next call; if a `setup()` has side effects
  that shouldn't repeat on failure, that's a separate concern for the definition
  author, not this cache.
- Reviewer: confirm the success path still memoizes (no accidental re-run of a
  resolved setup) — the second test guards that.
