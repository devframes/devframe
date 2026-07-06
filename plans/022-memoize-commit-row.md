# Plan 022: Memoize the git commit-log rows to cut re-render cost

> **Executor instructions**: Follow this plan step by step. If a STOP condition
> occurs, stop and report. When done, update this plan's row in `plans/README.md`
> unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- plugins/git/src/client/components/views/log-panel-view.tsx`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

The git dashboard's commit log accumulates all infinite-scroll pages into one
unbounded array and renders every row unvirtualized; `CommitRow` is a plain
function (not memoized) and each renders an SVG graph cell. Selecting a commit
flows `selectedHash` down and re-runs **every** `CommitRow` even though only the
`selected` flag of one row changed. For a few hundred commits this is a visible
re-render tax on each click. Memoizing the row makes selection O(changed rows).

## Current state

`plugins/git/src/client/components/views/log-panel-view.tsx`:
- `:168` `function CommitRow({ commit, row, gutter, currentBranch, isHead, topStub, selected, onSelect }: { … })` — a plain function component.
- `:366` `<CommitRow … />` rendered inside the `commits.map(...)`.
- `computeGraph` is already memoized (`:284` per the audit), so the props passed
  to each `CommitRow` (graph-derived objects) are stable across a selection change.

The list is accumulated in `plugins/git/src/client/components/log-panel.tsx:66`
(`setCommits(prev => [...prev, ...unique])`) via an `IntersectionObserver`
sentinel (`log-panel-view.tsx:315`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm --filter @devframes/plugin-git typecheck` | exit 0 |
| Build | `pnpm --filter @devframes/plugin-git build` | exit 0 |
| Test | `pnpm exec vitest run plugins/git/test` | all pass (no behavior change) |
| Storybook (visual) | `pnpm --filter @devframes/plugin-git storybook` | log panel renders + selection works |

## Scope

**In scope**:
- `plugins/git/src/client/components/views/log-panel-view.tsx` (memoize `CommitRow`)

**Out of scope**: row virtualization (deferred — see notes; it interacts with the
`IntersectionObserver` sentinel and is a larger change), the RPC/data layer, and
`log-panel.tsx`.

## Git workflow

- Branch: `advisor/022-memoize-commit-row`.
- Commit style: `perf(plugin-git): memoize commit log rows`.

## Steps

### Step 1: Wrap `CommitRow` in `React.memo`

Confirm each prop passed at `:366` is referentially stable across a
selection-only change (graph objects come from the memoized `computeGraph`;
`onSelect` must be a stable callback — wrap it in `useCallback` in the parent if
it isn't). Then:

```tsx
const CommitRow = memo(function CommitRow({ commit, row, gutter, currentBranch, isHead, topStub, selected, onSelect }: { /* same props */ }) {
  // …unchanged body…
})
```

Import `memo` (and `useCallback` if needed) from `react`.

### Step 2: Ensure `onSelect` is stable

If the parent creates `onSelect={() => onSelect(commit.hash)}` inline per row,
memoization won't help (new function each render). Pass a stable
`onSelect={handleSelect}` where `handleSelect` is `useCallback((hash) => …, [])`
and have `CommitRow` call `onSelect(commit.hash)` internally, or pass the hash
via a stable handler. Verify props are stable so `memo` actually skips unchanged
rows.

### Step 3: Verify

**Verify**: `pnpm --filter @devframes/plugin-git typecheck` + `build` succeed;
`pnpm exec vitest run plugins/git/test` still passes; in Storybook, selecting a
commit updates only the selected row (use React DevTools "highlight updates" or a
temporary render counter to confirm non-selected rows don't re-render).

## Done criteria

- [ ] `CommitRow` is wrapped in `React.memo` and its props are referentially stable across selection.
- [ ] Selecting a commit no longer re-renders every row (verified via DevTools/render count).
- [ ] `pnpm --filter @devframes/plugin-git typecheck` + `build` exit 0; git tests pass.
- [ ] Only `log-panel-view.tsx` changed (unless a stable `onSelect` also needs a parent tweak — keep it minimal).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:
- Props to `CommitRow` are not referentially stable and making them stable
  requires broad changes across the dashboard — report; a partial memo is worse
  than none.
- `computeGraph` is not actually memoized at HEAD (drift) — reassess.

## Maintenance notes

- **Deferred**: list virtualization for very long histories (the accumulated
  `commits` array is unbounded). It must preserve the `IntersectionObserver`
  sentinel; scope it separately.
- Reviewer: confirm memo actually skips unchanged rows (not defeated by unstable props).
