# Plan 005: Block prototype-chain traversal and mutation in Data Inspector writes

> **Executor instructions**: Follow this plan step by step and run every verification command. Stop if protecting object writes would require changing Map semantics. Update `plans/README.md` when complete unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 2d978f84..HEAD -- plugins/data-inspector/src/engine/normalize.ts plugins/data-inspector/src/engine/write.ts plugins/data-inspector/test/write.test.ts`
> If any file changed, compare `navigate`, `setAt`, `addTo`, and `renameAt` with the excerpts below; stop on a mismatch.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `2d978f84`, 2026-09-01

## Why this matters

Data Inspector re-descends object paths through inherited properties and assigns caller-selected keys directly. A write path can therefore reach shared prototypes and mutate behavior outside the inspected source. Object operations must remain on own properties and reject prototype-sensitive property names while preserving Map keys as data.

## Current state

- `plugins/data-inspector/src/engine/normalize.ts` normalizes graphs and provides `navigate()`.
- `plugins/data-inspector/src/engine/write.ts` applies set/delete/add/rename operations.
- `plugins/data-inspector/test/write.test.ts` is the canonical operation matrix.

Current inherited traversal:

```ts
// normalize.ts:99-107
for (const [kind, at] of path) {
  // ...
  case 'k':
    cur = cur instanceof Map ? cur.get(at) : (cur as Record<string, unknown>)[at]
}
```

Current direct assignments occur at `write.ts:89-94` and `write.ts:194-199`. Delete already uses `Object.hasOwn` at lines 139-144; match that ownership convention.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Targeted test | `pnpm exec vitest run plugins/data-inspector/test/write.test.ts` | all tests pass |
| Package typecheck | `pnpm --filter @devframes/plugin-data-inspector typecheck` | exit 0 |
| Full verification | `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build` | every command exits 0 |

## Scope

**In scope**:

- `plugins/data-inspector/src/engine/normalize.ts`
- `plugins/data-inspector/src/engine/write.ts`
- `plugins/data-inspector/test/write.test.ts`

**Out of scope**:

- Map keys named `constructor`, `prototype`, or `__proto__`; Map keys are data and must keep working.
- Query-language evaluation, RPC authentication, and normalization resource limits.
- Changing the wire shape of `WriteRequest`.
- Broad object cloning or freezing.

## Git workflow

- Branch if needed: `fix/data-inspector-prototype-writes`.
- Commit style: `fix(data-inspector): block prototype-chain writes`.
- Do not push/open a PR unless instructed.

## Steps

### Step 1: Centralize safe plain-object key checks

Add one small internal helper for non-Map object property operations. It must reject `__proto__`, `prototype`, and `constructor` consistently with a named `WriteError` (reuse `InvalidKey` unless the current error union requires a dedicated name). Apply it to every plain-object set, add, and rename destination. Do not apply it to Map operations.

For a set/rename source path that denotes an existing object property, require `Object.hasOwn(parent, key)` before reading or assigning. Preserve existing descriptor checks for readonly/accessor properties. For add and rename destinations, create an own data property with `Object.defineProperty(..., { configurable: true, enumerable: true, writable: true, value })` rather than bracket assignment, so an inherited setter cannot run. Continue rejecting the three prototype-sensitive names even though `defineProperty` could create them as own properties.

**Verify**: `pnpm --filter @devframes/plugin-data-inspector typecheck` -> exit 0.

### Step 2: Make navigation own-property-only

In `navigate()`, retain `Map.get` behavior. For ordinary objects, return `undefined` when the requested key is not an own property before reading it. This aligns live re-navigation with the normalizer, which exposes an object's own graph rather than its prototype chain.

Do not invoke getters solely to determine ownership.

**Verify**: `pnpm exec vitest run plugins/data-inspector/test/engine.test.ts plugins/data-inspector/test/write.test.ts` -> all tests pass.

### Step 3: Add regression coverage for every write shape

Add tests proving set, add, and rename reject prototype-sensitive keys; nested inherited traversal returns `PathNotFound`; and `Object.prototype` remains unchanged after each attempt. Add a custom-prototype fixture with an inherited setter and prove add/rename creates an own data property without invoking that setter. Use `try/finally` cleanup around any prototype sentinel so a failed assertion cannot contaminate later tests.

Add a positive test proving a Map can still use the same strings as keys.

**Verify**: `pnpm exec vitest run plugins/data-inspector/test/write.test.ts` -> all tests pass.

## Done criteria

- [ ] Plain-object navigation never follows inherited properties.
- [ ] Plain-object set/add/rename reject all prototype-sensitive names.
- [ ] Maps preserve arbitrary key semantics.
- [ ] Regression tests assert global prototypes remain unchanged.
- [ ] Targeted tests, package typecheck, and full verification pass.
- [ ] Only in-scope files and `plans/README.md` changed.

## STOP conditions

- The normalizer deliberately exposes inherited properties elsewhere and tests rely on mutating them.
- The public `WriteError` union cannot represent rejection without a public API decision.
- A proposed fix changes Map behavior.

## Maintenance notes

All future write operations must use the same plain-object key helper. Reviewers should search for bracket assignment and `Object.defineProperty` in the engine before approval.
