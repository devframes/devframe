# Plan 004: Stop git argument injection via client-supplied `ref`/`hash`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- plugins/git/src/rpc/functions/log.ts plugins/git/src/rpc/functions/show.ts plugins/git/src/node/git.ts plugins/git/test/git.test.ts`
> On any change since this plan was written, compare against the "Current state"
> excerpts before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (coordinate with plan 014, which also edits `show.ts`/`log.ts` — do 004 first)
- **Category**: security / bug
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

`git:log` and `git:show` push client-supplied revision strings straight onto the
`git` argv with no end-of-options guard. A value beginning with `-` is parsed by
git as an **option**, not a revision. git's `log`/`show`/`diff-tree` accept diff
options including `--output=<file>`, turning these read-only RPCs into an
arbitrary-file-write / flag-injection primitive driven by untrusted repo input or
(given plan 003's threat model) a malicious page. The `git:diff` path already
guards correctly with `['--', path]` (`diff.ts:73`) — the revision paths do not.

Note: `--` alone separates *paths*, not revisions — `git log -- <ref>` would
treat the ref as a pathspec. The correct guard for a revision is
`--end-of-options` (git ≥ 2.24), plus rejecting values that start with `-`
(git refnames legitimately never start with `-`, and hashes are hex).

## Current state

Commands run via `execFile` (no shell) — `plugins/git/src/node/git.ts:22-31`
(`runGit`) and `:34-42` (`tryGit`). So this is **argument** injection, not shell
metacharacter injection.

`plugins/git/src/rpc/functions/log.ts:99-114`:

```ts
const ref = args.ref?.trim() || undefined
// ...
const command = [
  'log', '--topo-order', `--max-count=${limit}`, `--skip=${skip}`, `--pretty=format:${FORMAT}`,
]
if (ref)
  command.push(ref)              // ← unguarded client ref
```

`plugins/git/src/rpc/functions/show.ts` — `readCommit(git, hash, includePatch)`
builds three commands with the client `hash` (`show.ts:104-133`):

```ts
const meta = await tryGit(git.cwd, ['show', '-s', `--format=${SHOW_FORMAT}`, hash])            // :105
const numstat = await tryGit(git.cwd, ['diff-tree', '--no-commit-id', '--numstat', '-r', '--root', hash]) // :125
const raw = await tryGit(git.cwd, ['diff-tree', '-p', '--no-commit-id', '-r', '--root', hash]) // :133
```

`hash` originates from `ShowArgs.hash` (`show.ts:201-207`, already `.trim()`ed);
`ref` from `LogArgs.ref` (`log.ts:99`). Both are always-registered read
functions (`plugins/git/src/rpc/index.ts`), and the git CLI ships `auth:false`.

Test fixture + patterns: `plugins/git/test/git.test.ts` (temp repo via
`./_repo`, `bootRpc(port)` client, `rpc.$call('git:log'/'git:show', …)`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test (git) | `pnpm exec vitest run plugins/git/test/git.test.ts` | all pass incl. new cases |
| Typecheck | `pnpm --filter @devframes/plugin-git typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `plugins/git/src/node/git.ts` (add a small `isSafeRevision` helper)
- `plugins/git/src/rpc/functions/log.ts` (guard `ref`)
- `plugins/git/src/rpc/functions/show.ts` (guard `hash`, add `--end-of-options`)
- `plugins/git/test/git.test.ts` (new security tests)

**Out of scope** (do NOT touch):
- `diff.ts` / `stage.ts` / `unstage.ts` — already guard paths with `['--', ...]`.
- The dedup refactor of `parseNumstat`/`PATCH_CHAR_LIMIT` — that's plan 014;
  keep this change minimal so the two don't collide (do 004 first).

## Git workflow

- Branch: `advisor/004-git-arg-injection`.
- Commit style: `fix(plugin-git): guard client refs/hashes against argument injection`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add an `isSafeRevision` helper to `node/git.ts`

```ts
/**
 * A client-supplied revision (ref or hash) must never begin with `-`, which git
 * would parse as an option. git refnames legitimately never start with `-`
 * (see `git check-ref-format`), and hashes are hex, so this rejects only the
 * injection shape.
 */
export function isSafeRevision(rev: string): boolean {
  return rev.length > 0 && !rev.startsWith('-')
}
```

### Step 2: Guard `log.ts`

Import `isSafeRevision`; when a `ref` is present, reject an unsafe one (treat it
like "no matching commits") and pass a safe one after `--end-of-options`:

```ts
const ref = args.ref?.trim() || undefined
if (ref && !isSafeRevision(ref))
  return { isRepo: true, commits: [], limit, skip, hasMore: false }
// ...
if (ref)
  command.push('--end-of-options', ref)
```

### Step 3: Guard `show.ts`

In `readCommit`, bail early on an unsafe hash and add `--end-of-options` before
the hash in all three commands:

```ts
async function readCommit(git: GitContext, hash: string, includePatch: boolean): Promise<CommitDetail> {
  if (!isSafeRevision(hash))
    return { ...EMPTY_DETAIL, isRepo: true }
  const meta = await tryGit(git.cwd, ['show', '-s', `--format=${SHOW_FORMAT}`, '--end-of-options', hash])
  // ...
  const numstat = await tryGit(git.cwd, ['diff-tree', '--no-commit-id', '--numstat', '-r', '--root', '--end-of-options', hash])
  // ...
  const raw = await tryGit(git.cwd, ['diff-tree', '-p', '--no-commit-id', '-r', '--root', '--end-of-options', hash])
}
```

(The static-dump loop at `show.ts:181-193` feeds hashes from `git log %H`, which
are safe, but they now flow through the same guarded `readCommit` — fine.)

### Step 4: Tests

Add to `git.test.ts` (in the main `describe`, which has a 2-commit temp repo):

```ts
it('does not let a dashed ref inject a git option (argument injection)', async () => {
  const rpc = bootRpc(server.port)
  const marker = join(repo.dir, 'pwned.txt') // import { join } from 'node:path'
  // Without the guard, `git log --output=<marker>` would create the file.
  const log = await rpc.$call('git:log', { ref: `--output=${marker}` }) as GitLog
  expect(log.commits).toEqual([])
  expect(existsSync(marker)).toBe(false) // import { existsSync } from 'node:fs'
})

it('shows a real commit and rejects a dashed hash', async () => {
  const rpc = bootRpc(server.port)
  const log = await rpc.$call('git:log', { limit: 30 }) as GitLog
  const detail = await rpc.$call('git:show', { hash: log.commits[0].hash }) as CommitDetail
  expect(detail.found).toBe(true)
  expect(detail.hash).toBe(log.commits[0].hash)

  const injected = await rpc.$call('git:show', { hash: '--output=/tmp/x' }) as CommitDetail
  expect(injected.found).toBe(false)
})
```

Add the needed imports (`CommitDetail` from `../src/index`, `join`, `existsSync`).

**Verify**: `pnpm exec vitest run plugins/git/test/git.test.ts` → all pass.

## Test plan

- New cases: dashed `ref` to `git:log` creates no file and returns no commits; a
  valid hash to `git:show` returns the commit; a dashed hash returns `found:false`.
- All existing git tests keep passing (normal refs/hashes unaffected — a real
  ref/hash never starts with `-`).
- `pnpm --filter @devframes/plugin-git typecheck` + `pnpm lint` clean.

## Done criteria

- [ ] `isSafeRevision` exported from `node/git.ts` and used in `log.ts` + `show.ts`.
- [ ] All three `readCommit` git invocations include `--end-of-options` before the hash.
- [ ] `log.ts` passes `--end-of-options` before a valid `ref`.
- [ ] `pnpm exec vitest run plugins/git/test/git.test.ts` passes incl. the 2 new tests.
- [ ] `pnpm --filter @devframes/plugin-git typecheck` + `pnpm lint` exit 0.
- [ ] Only the 4 in-scope files changed (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- The installed git rejects `--end-of-options` (would indicate git < 2.24) —
  report; the validation guard alone still closes the hole, but confirm before
  relying only on it.
- A dedup refactor (plan 014) has already landed and moved these helpers — then
  apply the guards in their new location and note it.
- The happy-path `git:show` test can't obtain a hash (fixture changed).

## Maintenance notes

- Any future git RPC that accepts a client-supplied revision must route it
  through `isSafeRevision` + `--end-of-options`. Consider a shared arg-builder in
  `node/git.ts` if more revision-taking functions are added.
- A reviewer should confirm no revision reaches the argv without either the
  guard or `--end-of-options`, and that the happy path (real refs/hashes) is
  unchanged.
