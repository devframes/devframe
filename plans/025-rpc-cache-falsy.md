# Plan 025: Make the client RPC response cache serve falsy values

> **Executor instructions**: Follow this plan step by step. If a STOP condition
> occurs, stop and report. When done, update this plan's row in `plans/README.md`
> unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- packages/devframe/src/rpc/cache.ts packages/devframe/src/rpc/cache.test.ts packages/devframe/src/client/rpc.ts`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (experimental API)
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

The client RPC response cache checks `if (cached)` — a truthiness test — so a
legitimately cached `0` / `''` / `false` / `null` reads as a miss and is
re-fetched every call. The cache is `@experimental`, so severity is low, but the
fix is a one-liner presence check that makes the cache correct for all value
types.

## Current state

`packages/devframe/src/rpc/cache.ts:28-40`:

```ts
cached<T>(m: string, a: unknown[]): T | undefined {
  const methodCache = this.cacheMap.get(m)
  if (methodCache) return methodCache.get(this.keySerializer(a)) as T
  return undefined
}
apply(req, res): void { /* sets methodCache.set(key, res) */ }
```

`packages/devframe/src/client/rpc.ts:316-331` (the cache path in `onRequest`):

```ts
async onRequest(req, next, resolve) {
  await rpcOptions.onRequest?.call(this, req, next, resolve)
  if (cacheOptions && cacheManager?.validate(req.m)) {
    const cached = cacheManager.cached(req.m, req.a)
    if (cached) {                       // ← falsy cached values re-fetch
      return resolve(cached)
    }
    else {
      const res = await next(req)
      cacheManager?.apply(req, res)
    }
  }
  else {
    await next(req)
  }
}
```

Test file: `packages/devframe/src/rpc/cache.test.ts`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Test | `pnpm exec vitest run packages/devframe/src/rpc/cache.test.ts` | all pass incl. new case |
| Typecheck | `pnpm --filter devframe typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `packages/devframe/src/rpc/cache.ts` (add a `has` presence check)
- `packages/devframe/src/client/rpc.ts` (use presence instead of truthiness)
- `packages/devframe/src/rpc/cache.test.ts` (falsy-value case)

**Out of scope**: redesigning the cache eviction/TTL; the broader `onRequest`
composition (see STOP for the double-`next` note).

## Git workflow

- Branch: `advisor/025-rpc-cache-falsy`.
- Commit style: `fix(rpc): cache falsy RPC results (presence check, not truthiness)`.

## Steps

### Step 1: Add `has` to the cache manager

```ts
has(m: string, a: unknown[]): boolean {
  return this.cacheMap.get(m)?.has(this.keySerializer(a)) ?? false
}
```

### Step 2: Use presence in the client cache path

```ts
if (cacheOptions && cacheManager?.validate(req.m)) {
  if (cacheManager.has(req.m, req.a)) {
    return resolve(cacheManager.cached(req.m, req.a))
  }
  const res = await next(req)
  cacheManager.apply(req, res)
}
else {
  await next(req)
}
```

### Step 3: Test falsy caching

Add to `cache.test.ts`: `apply` a `0` (and a `false`/`''`) result, then assert
`has` is `true` and the client path serves it without calling `next` a second
time (use a spy on `next` / a counting fake).

**Verify**: `pnpm exec vitest run packages/devframe/src/rpc/cache.test.ts` → pass.

## Done criteria

- [ ] `RpcCacheManager.has` exists and the client uses it instead of `if (cached)`.
- [ ] A cached `0`/`false`/`''` is served (not re-fetched); new test proves it.
- [ ] `pnpm exec vitest run packages/devframe/src/rpc/cache.test.ts` passes.
- [ ] `pnpm --filter devframe typecheck` + `pnpm lint` exit 0.
- [ ] Only the 3 in-scope files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:
- You confirm the secondary bug: `rpcOptions.onRequest?.call(...)` at `rpc.ts:317`
  may already call `next`/`resolve` (birpc contract), and then this code calls
  `next` again — a double-dispatch when a user hook is combined with
  `cacheOptions`. If you can reproduce it, report it as a separate finding rather
  than expanding this plan's scope.

## Maintenance notes

- Cache is `@experimental` (`cache.ts:9-10`); keep changes minimal.
- Reviewer: confirm the presence check distinguishes "stored undefined/null" from
  "absent".
