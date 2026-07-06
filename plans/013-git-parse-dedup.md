# Plan 013: De-duplicate git output-parsing helpers into `node/git.ts`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- plugins/git/src/rpc/functions/show.ts plugins/git/src/rpc/functions/diff.ts plugins/git/src/rpc/functions/log.ts plugins/git/src/node/git.ts`
> On any change since this plan was written, compare against the "Current state"
> excerpts before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plan 004 (also edits `show.ts`/`log.ts`) — land 004 first, then this
- **Category**: tech-debt
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

The numstat/patch-truncation logic is copy-pasted across the git RPC functions,
so a bug fix or limit change must be made in 2–4 places and copies drift. This is
genuine non-UI logic duplication (distinct from the intentional per-framework UI
component ports). A shared home already exists: `plugins/git/src/node/git.ts`.

## Current state

- `parseNumstat` is identical (only the return type name differs) in
  `plugins/git/src/rpc/functions/show.ts:91-102` (`CommitFile[]`) and
  `diff.ts:35-46` (`DiffFile[]`):
  ```ts
  function parseNumstat(raw: string): DiffFile[] {
    return splitClean(raw, '\n').map((line) => {
      const [add, del, ...rest] = line.split('\t')
      const binary = add === '-' || del === '-'
      return { path: rest.join('\t'), additions: binary ? 0 : Number(add), deletions: binary ? 0 : Number(del), binary }
    })
  }
  ```
- `PATCH_CHAR_LIMIT = 200_000` is redefined in `show.ts:7` and `diff.ts:6`.
- The patch-truncation block is duplicated: `show.ts:135-142` and `diff.ts:84-90`
  (`if (raw.length > PATCH_CHAR_LIMIT) { slice; truncated = true } else { patch = raw }`).
- `SNAPSHOT_LIMIT = 200` is duplicated in `log.ts:76` and `show.ts:10`.
- `CommitFile` (`show.ts:12-17`) and `DiffFile` (`diff.ts:8-13`) are structurally
  identical (`{ path, additions, deletions, binary }`).
- `node/git.ts` already exports `splitClean`, `tryGit`, `runGit`, `UNIT`, etc.;
  `node/index.ts` is empty.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test | `pnpm exec vitest run plugins/git/test/git.test.ts` | all pass (unchanged behavior) |
| Typecheck | `pnpm --filter @devframes/plugin-git typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `plugins/git/src/node/git.ts` (add shared helpers/const/type)
- `plugins/git/src/rpc/functions/show.ts` (import instead of redefine)
- `plugins/git/src/rpc/functions/diff.ts` (same)
- `plugins/git/src/rpc/functions/log.ts` (import `SNAPSHOT_LIMIT`)

**Out of scope**: changing any RPC return shape or behavior. This is a pure
extraction — the JSON returned by `git:diff`/`git:show`/`git:log` must be
byte-identical. Do not merge `CommitFile`/`DiffFile` into the public export types
if that changes the plugin's published `.d.ts` surface in a breaking way — export
a shared `NumstatFile` and alias, keeping the existing type names exported.

## Git workflow

- Branch: `advisor/013-git-parse-dedup`.
- Commit style: `refactor(plugin-git): consolidate numstat/patch helpers in node/git.ts`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add shared helpers to `node/git.ts`

```ts
/** Hard cap on returned patch text to keep payloads bounded. */
export const PATCH_CHAR_LIMIT = 200_000

/** Matches the window `git:log` snapshots so any visible commit has a detail record. */
export const SNAPSHOT_LIMIT = 200

export interface NumstatFile {
  path: string
  additions: number
  deletions: number
  binary: boolean
}

export function parseNumstat(raw: string): NumstatFile[] {
  return splitClean(raw, '\n').map((line) => {
    const [add, del, ...rest] = line.split('\t')
    const binary = add === '-' || del === '-'
    return { path: rest.join('\t'), additions: binary ? 0 : Number(add), deletions: binary ? 0 : Number(del), binary }
  })
}

export function truncatePatch(raw: string): { patch: string, truncated: boolean } {
  if (raw.length > PATCH_CHAR_LIMIT)
    return { patch: raw.slice(0, PATCH_CHAR_LIMIT), truncated: true }
  return { patch: raw, truncated: false }
}
```

### Step 2: Update `show.ts`

Remove its local `PATCH_CHAR_LIMIT`, `SNAPSHOT_LIMIT`, and `parseNumstat`; keep
`CommitFile` exported but alias it to the shared type
(`export type CommitFile = NumstatFile`) so the public type name is preserved.
Import `PATCH_CHAR_LIMIT`, `SNAPSHOT_LIMIT`, `parseNumstat`, `truncatePatch` from
`../../node/git.ts` and use `truncatePatch(raw)` in the patch block (`:135-142`).

### Step 3: Update `diff.ts`

Same: drop local `PATCH_CHAR_LIMIT`/`parseNumstat`; `export type DiffFile = NumstatFile`;
import the shared helpers; use `truncatePatch(stdout)` in the patch block (`:84-90`).

### Step 4: Update `log.ts`

Import `SNAPSHOT_LIMIT` from `../../node/git.ts` instead of its local `const`.

### Step 5: Verify no behavior change

**Verify**: `pnpm exec vitest run plugins/git/test/git.test.ts` → all existing
tests pass unchanged (diff/show/log payloads identical).

## Test plan

- No new tests required — the existing git suite (numstat parsing via
  `git:diff`, patch truncation via single-path diff, snapshot window) already
  exercises these paths and must stay green. If plan 019 (git:show test) has
  landed, it must also stay green.
- `pnpm --filter @devframes/plugin-git typecheck` + `pnpm lint` clean.

## Done criteria

- [ ] `parseNumstat`, `truncatePatch`, `PATCH_CHAR_LIMIT`, `SNAPSHOT_LIMIT`, `NumstatFile` exported from `node/git.ts`.
- [ ] `show.ts`, `diff.ts`, `log.ts` import them; no local re-definitions remain (`grep -n "function parseNumstat" plugins/git/src/rpc/functions` returns nothing).
- [ ] Public type names `CommitFile`/`DiffFile` still exported (aliased).
- [ ] `pnpm exec vitest run plugins/git/test/git.test.ts` passes with no changes to expectations.
- [ ] `pnpm --filter @devframes/plugin-git typecheck` + `pnpm lint` exit 0.
- [ ] Only the 4 in-scope files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Aliasing `CommitFile`/`DiffFile` to a shared type changes the emitted `.d.ts`
  in a way `tsnapi` snapshots flag — reconcile the snapshot intentionally or keep
  the type names as independent identical interfaces re-exported.
- Plan 004's `--end-of-options` edits are not yet present in `show.ts`/`log.ts`
  and you'd be editing the same lines — land 004 first (this plan depends on it).

## Maintenance notes

- Future numstat/patch changes now happen once in `node/git.ts`.
- Reviewer: confirm the extraction is behavior-preserving (git suite green with
  unchanged assertions) and the public type surface is unchanged.
