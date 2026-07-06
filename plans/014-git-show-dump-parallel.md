# Plan 014: Parallelize the `git:show` static dump

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- plugins/git/src/rpc/functions/show.ts`
> On any change since this plan was written, compare against the "Current state"
> excerpt before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: plan 004 and plan 013 (both edit `show.ts`) — land those first
- **Category**: perf
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

The `git:show` static-build dump loops over up to `SNAPSHOT_LIMIT = 200` commits
**serially**, and each `readCommit` awaits two `git` subprocess spawns. That's up
to ~400 sequential process launches per static build; process-spawn latency
dominates, so every static build/CI run pays hundreds of serialized round-trips.
Bounding the work to a small concurrency window cuts wall-clock time
dramatically. git tolerates parallel read-only invocations, and the output is
keyed by hash so order doesn't matter.

## Current state

`plugins/git/src/rpc/functions/show.ts:189-196` (inside the `dump`):

```ts
const records = []
for (const hash of hashes) {
  const output = await readCommit(git, hash, false)
  records.push({ inputs: [{ hash }], output })
}

const fallback = records[0]?.output ?? { ...EMPTY_DETAIL, isRepo: true }
return { records, fallback } as any
```

`hashes` comes from a single `git log --max-count=SNAPSHOT_LIMIT --pretty=format:%H`
(`show.ts:181-187`). `readCommit(git, hash, false)` (`show.ts:104-`) awaits two
`tryGit` spawns (`git show -s` + `git diff-tree --numstat`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test | `pnpm exec vitest run plugins/git/test/git.test.ts` | all pass incl. new dump case |
| Typecheck | `pnpm --filter @devframes/plugin-git typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `plugins/git/src/rpc/functions/show.ts` (bounded-concurrency dump)
- `plugins/git/test/git.test.ts` (dump correctness case)

**Out of scope**: adding a new dependency. Use a small hand-rolled batch window
(below) rather than pulling `p-limit` into the plugin, to avoid a `package.json`/
catalog change. The `setup`/`handler` path (single commit) is unchanged.

## Git workflow

- Branch: `advisor/014-git-show-dump-parallel`.
- Commit style: `perf(plugin-git): parallelize the git:show static dump`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Batch the per-hash work with bounded concurrency

Replace the serial loop with a fixed-window batch (order preserved, no new dep):

```ts
const CONCURRENCY = 8
const records: { inputs: [{ hash: string }], output: CommitDetail }[] = []
for (let i = 0; i < hashes.length; i += CONCURRENCY) {
  const batch = hashes.slice(i, i + CONCURRENCY)
  const outputs = await Promise.all(batch.map(hash => readCommit(git, hash, false)))
  batch.forEach((hash, j) => records.push({ inputs: [{ hash }], output: outputs[j] }))
}

const fallback = records[0]?.output ?? { ...EMPTY_DETAIL, isRepo: true }
return { records, fallback } as any
```

### Step 2: Test dump correctness

Add to the `@devframes/plugin-git (build snapshot)` describe in `git.test.ts`
(model after the existing `git:status` snapshot test at `git.test.ts:160-182`,
which uses `createDashboardContext(repo.dir, 'build')` + `collectStaticRpcDump`):

```ts
it('bakes one show record per commit in the snapshot', async () => {
  const repo = createTempRepo()
  try {
    const ctx = await createDashboardContext(repo.dir, 'build')
    const dump = await collectStaticRpcDump(ctx.rpc.definitions.values(), ctx)
    const entry = dump.manifest['git:show']
    expect(entry).toBeDefined()
    // The temp repo has 2 commits; both should be baked, each with a hash + output.
    const files = Object.values(dump.files).map(f => (f.data as any).output)
    const shown = files.filter(o => o && o.found === true)
    expect(shown.length).toBeGreaterThanOrEqual(2)
  }
  finally {
    repo.cleanup()
  }
})
```

Adjust the assertion to how the git dump surfaces records in the manifest/files
(inspect `dump.manifest['git:show']` shape while writing). The key assertion:
every commit in the window produced a record, and order/content match the serial
version.

**Verify**: `pnpm exec vitest run plugins/git/test/git.test.ts` → all pass.

## Test plan

- New: the build snapshot bakes a record per commit (correctness under
  parallelism); existing git suite unchanged.
- `pnpm --filter @devframes/plugin-git typecheck` + `pnpm lint` clean.

## Done criteria

- [ ] The dump uses a bounded-concurrency batch (no serial `for … await` over all hashes), order preserved.
- [ ] No new dependency added to `plugins/git/package.json`.
- [ ] New dump-correctness test passes; existing git tests pass.
- [ ] `pnpm --filter @devframes/plugin-git typecheck` + `pnpm lint` exit 0.
- [ ] Only the 2 in-scope files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Parallel git invocations in the test environment intermittently fail (e.g.
  index-lock contention) — the dump is read-only (`show`/`diff-tree`), so this
  shouldn't happen; if it does, lower `CONCURRENCY` and report.
- Plans 004/013 haven't landed and you'd edit the same `show.ts` lines — land
  them first (this plan depends on both).

## Maintenance notes

- If `SNAPSHOT_LIMIT` grows, `CONCURRENCY` may want tuning; keep it modest
  (git spawns are cheap-ish but not free).
- Reviewer: confirm record order still matches commit order (fallback = newest
  commit's output).
