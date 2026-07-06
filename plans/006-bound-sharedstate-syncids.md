# Plan 006: Bound `SharedState.syncIds` so it stops leaking memory

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- packages/devframe/src/utils/shared-state.ts packages/devframe/src/utils/shared-state.test.ts`
> On any change since this plan was written, compare against the "Current state"
> excerpt before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (must preserve loop-prevention semantics)
- **Depends on**: none
- **Category**: bug (memory leak)
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

`createSharedState` tracks every applied `syncId` in a `Set` to prevent echo
loops, but it never evicts — every `patch()`/`mutate()` adds an id and nothing
removes it. Any long-lived, frequently-mutated shared state leaks memory for the
life of the process. Concretely, `plugins/terminals/src/node/manager.ts` mutates
its sessions state on a 1-second process poll, adding ~3,600 `nanoid` strings/hour
to the set forever. Storage (`node/storage.ts`), and every hub docks/commands/
settings state, share this primitive. A bounded FIFO keeps loop prevention
(echoes are near-immediate) while capping memory.

## Current state

`packages/devframe/src/utils/shared-state.ts:81-117`:

```ts
const events = createEventEmitter<SharedStateEvents<T>>()
let state = options.initialValue
const syncIds = new Set<string>()

return {
  on: events.on,
  value: () => state as Immutable<T>,
  patch: (patches, syncId = nanoid()) => {
    if (syncIds.has(syncId)) return
    enableImmerPatches()
    state = applyPatches(...) as T
    syncIds.add(syncId)                 // ← never evicted
    events.emit('updated', state, undefined, syncId)
  },
  mutate: (fn, syncId = nanoid()) => {
    if (syncIds.has(syncId)) return
    syncIds.add(syncId)                 // ← never evicted
    // ...produce + emit...
  },
  syncIds,
}
```

`syncIds` is also exposed on the returned object and read in tests
(`shared-state.test.ts:134,164,196,281,289-304`). `Set` preserves insertion
order, so the oldest entry is `syncIds.values().next().value`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test | `pnpm exec vitest run packages/devframe/src/utils/shared-state.test.ts` | all pass incl. new case |
| Typecheck | `pnpm --filter devframe typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `packages/devframe/src/utils/shared-state.ts`
- `packages/devframe/src/utils/shared-state.test.ts`

**Out of scope**: callers of `createSharedState`. The fix is entirely inside the
factory; behavior for recent syncIds is unchanged.

## Git workflow

- Branch: `advisor/006-bound-syncids`.
- Commit style: `fix(shared-state): cap syncIds with FIFO eviction to stop memory growth`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add a bounded-add helper and cap the set

Add a module constant and evict the oldest entry past the cap after each add:

```ts
/**
 * Upper bound on retained syncIds. Loop echoes arrive near-immediately, so a
 * generous window preserves de-dup while capping memory on long-lived,
 * frequently-mutated states (e.g. a 1s terminal poll).
 */
const MAX_SYNC_IDS = 1000

function rememberSyncId(syncIds: Set<string>, syncId: string): void {
  syncIds.add(syncId)
  if (syncIds.size > MAX_SYNC_IDS) {
    const oldest = syncIds.values().next().value
    if (oldest !== undefined)
      syncIds.delete(oldest)
  }
}
```

Replace `syncIds.add(syncId)` in both `patch` and `mutate` with
`rememberSyncId(syncIds, syncId)`.

### Step 2: Test the bound

Add to the `sync dead loop prevention` describe in `shared-state.test.ts`:

```ts
it('caps syncIds and evicts oldest-first (FIFO), keeping recent de-dup', () => {
  const state = createSharedState({ initialValue: { count: 0 } })
  for (let i = 0; i < 1500; i++) {
    state.mutate((draft) => { draft.count = i }, `sync-${i}`)
  }
  expect(state.syncIds.size).toBeLessThanOrEqual(1000)
  // The most recent id is retained (still de-duped)...
  expect(state.syncIds.has('sync-1499')).toBe(true)
  // ...the oldest was evicted.
  expect(state.syncIds.has('sync-0')).toBe(false)
})
```

**Verify**: `pnpm exec vitest run packages/devframe/src/utils/shared-state.test.ts`
→ all pass (existing size-tracking tests use ≤3 ids, well under the cap, so they
still hold).

## Test plan

- New case: after 1500 unique mutations, `syncIds.size ≤ 1000`, newest retained,
  oldest evicted.
- Existing loop-prevention + size-tracking tests still pass unchanged.
- `pnpm --filter devframe typecheck` + `pnpm lint` clean.

## Done criteria

- [ ] `syncIds` size is capped at `MAX_SYNC_IDS` with FIFO eviction in both `patch` and `mutate`.
- [ ] Immediate duplicate-syncId de-dup still works (existing tests pass).
- [ ] New FIFO test passes.
- [ ] `pnpm exec vitest run packages/devframe/src/utils/shared-state.test.ts` passes.
- [ ] `pnpm --filter devframe typecheck` + `pnpm lint` exit 0.
- [ ] Only the 2 in-scope files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Any existing shared-state test breaks (the cap is 1000; existing tests use ≤3
  ids, so none should) — investigate rather than raising the cap blindly.
- A caller is found that relies on `syncIds` retaining ids indefinitely (grep
  `\.syncIds` across `packages/` and `plugins/` — today only tests read it).

## Maintenance notes

- The cap assumes echoes return within ~1000 mutations. If a future transport
  can echo a syncId after a very long delay (thousands of intervening
  mutations), that echo could slip through — unlikely, but note it for reviewers
  of any new sync transport.
- Reviewer: confirm eviction is oldest-first (FIFO via insertion order), not
  arbitrary.
