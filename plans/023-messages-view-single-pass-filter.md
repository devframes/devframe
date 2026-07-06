# Plan 023: Collapse the MessagesView filter chain into a single pass

> **Executor instructions**: Follow this plan step by step. If a STOP condition
> occurs, stop and report. When done, update this plan's row in `plans/README.md`
> unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- plugins/messages/src/client/components/MessagesView.vue`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (behavior-preserving)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

`filteredEntries` runs up to five chained `.filter()` passes (level, label, from,
category, search), each allocating a new intermediate array, then sorts. For
large message feeds (build-warning floods) each recompute is ~5N iterations plus
intermediate arrays. Collapsing to a single predicate pass removes the
intermediates. It's a Vue `computed` (memoized on deps) mirroring the upstream
view, so impact is bounded — this is a clean, low-risk tidy that matters at scale.

## Current state

`plugins/messages/src/client/components/MessagesView.vue:141-168` — chained
filters:

```ts
const filteredEntries = computed(() => {
  let entries = props.entries
  if (…level…)    entries = entries.filter(e => activeFilters.value.has(e.level))       // :144
  if (…label…)    entries = entries.filter(e => e.labels?.some(l => activeLabelFilters.value.has(l))) // :146
  if (…from…)     entries = entries.filter(e => activeFromFilters.value.has(e.from as …)) // :148
  if (…category…) entries = entries.filter(e => e.category && activeCategories.value.has(e.category)) // :150
  if (…search…)   entries = entries.filter(e => …)                                       // :153
  // …sort…
})
```

The result feeds `v-for` at `:314` (unvirtualized) and length displays at
`:229-230`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm --filter @devframes/plugin-messages typecheck` | exit 0 |
| Test | `pnpm exec vitest run plugins/messages` | all pass |
| Build | `pnpm --filter @devframes/plugin-messages build` | exit 0 |

## Scope

**In scope**:
- `plugins/messages/src/client/components/MessagesView.vue` (the `filteredEntries` computed only)

**Out of scope**: list virtualization (deferred), the filter UI, and any change
to what gets filtered (must be behavior-identical). Do not touch other computeds.

## Git workflow

- Branch: `advisor/023-messages-single-pass-filter`.
- Commit style: `perf(plugin-messages): single-pass message filtering`.

## Steps

### Step 1: One predicate, one pass

Rewrite `filteredEntries` to evaluate every active filter inside a single
`.filter()` (short-circuiting), preserving the exact conditions and the existing
sort:

```ts
const filteredEntries = computed(() => {
  const hasLevel = activeFilters.value.size > 0
  const hasLabel = activeLabelFilters.value.size > 0
  const hasFrom = activeFromFilters.value.size > 0
  const hasCategory = activeCategories.value.size > 0
  const search = /* the existing normalized search term */
  const result = props.entries.filter((e) => {
    if (hasLevel && !activeFilters.value.has(e.level)) return false
    if (hasLabel && !e.labels?.some(l => activeLabelFilters.value.has(l))) return false
    if (hasFrom && !activeFromFilters.value.has(e.from as DevframeMessageEntryFrom)) return false
    if (hasCategory && !(e.category && activeCategories.value.has(e.category))) return false
    if (search && !/* the existing search match on e */) return false
    return true
  })
  // …keep the existing sort exactly…
  return result
})
```

Preserve the **exact** guard conditions from the current code (copy them, don't
paraphrase — e.g. whatever decides "level filter active" at `:143`), so the
output is identical.

### Step 2: Verify equivalence

**Verify**: `pnpm exec vitest run plugins/messages` passes; if there's a Storybook
story for MessagesView, confirm the filter counts (`:229-230` `x/y`) match the old
behavior for a mixed dataset (all filters off → all entries; each filter → same
subset as before).

## Done criteria

- [ ] `filteredEntries` uses one `.filter()` pass with the same conditions + sort.
- [ ] Output is identical to the previous chained version for representative inputs.
- [ ] `pnpm --filter @devframes/plugin-messages typecheck` + `build` exit 0; messages tests pass.
- [ ] Only `MessagesView.vue` changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if the "filter active" guards are subtler than they look (e.g. an
empty search string means "no filter" vs. "match empty") — replicate the exact
semantics or STOP and ask.

## Maintenance notes

- **Deferred**: virtualize the `v-for` if feeds get very large.
- Reviewer: diff the predicate against the original five conditions to confirm no
  semantic drift.
