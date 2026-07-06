# Plan 012: Make `createStorage` writes atomic and non-throwing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- packages/devframe/src/node/storage.ts packages/devframe/src/node/diagnostics.ts`
> On any change since this plan was written, compare against the "Current state"
> excerpt before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: bug (data integrity)
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

`createStorage` persists state with a debounced `fs.writeFileSync` that has no
`try/catch` and is not atomic. A crash mid-`writeFileSync` truncates/corrupts the
JSON file, and a write error (EACCES/ENOSPC) throws **uncaught inside the
debounce timer**. The read path already tolerates a bad file (it warns and falls
back to defaults, `storage.ts:22-31`), so a corrupt write degrades to "settings
reset" — but a torn file and an uncaught async throw are avoidable with a
temp-file+rename write and error handling.

## Current state

`packages/devframe/src/node/storage.ts:38-45`:

```ts
// throttle the write to the file
state.on(
  'updated',
  debounce((newState) => {
    fs.mkdirSync(dirname(options.filepath), { recursive: true })
    fs.writeFileSync(options.filepath, `${JSON.stringify(newState, null, 2)}\n`)
  }, debounceTime),
)
```

Imports at top: `fs` (`node:fs`), `destr`, `createSharedState`, `dirname`
(`pathe`), `debounce` (`perfect-debounce`), `diagnostics` (`./diagnostics`).

Diagnostics live in `packages/devframe/src/node/diagnostics.ts` (codes
DF0006–DF0034 with gaps). Reported (non-thrown) diagnostics are called like
`diagnostics.DF0012({ filepath, cause: error }, { method: 'warn' })` (see the
read path, `storage.ts:28`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test | `pnpm exec vitest run packages/devframe/src/node/__tests__/storage.test.ts` | all pass incl. new cases |
| Typecheck | `pnpm --filter devframe typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `packages/devframe/src/node/storage.ts`
- `packages/devframe/src/node/diagnostics.ts` (add one code)
- `packages/devframe/src/node/__tests__/storage.test.ts` (new cases)

**Out of scope**: changing the `createStorage` return type / adding a public
`flush()` API (that's a larger change — see maintenance notes). Do not register
global `process` exit handlers here (conflicts with the headless-by-default
principle unless the maintainer opts in).

## Git workflow

- Branch: `advisor/012-atomic-storage-write`.
- Commit style: `fix(storage): write atomically via temp+rename and report write failures`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add a diagnostic code

In `node/diagnostics.ts`, add the next available `DF00xx` code (check the file;
if `DF0035` is unused, use it) for a storage write failure:

```ts
DF0035: {
  why: (p: { filepath: string }) => `Failed to persist storage file: ${p.filepath}`,
  fix: 'Check that the storage directory is writable and has free space.',
},
```

### Step 2: Atomic, guarded write

Rewrite the debounced writer in `storage.ts`. Import `process` (`node:process`)
for a pid-scoped temp name:

```ts
state.on(
  'updated',
  debounce((newState) => {
    try {
      const dir = dirname(options.filepath)
      fs.mkdirSync(dir, { recursive: true })
      const tmp = `${options.filepath}.${process.pid}.tmp`
      fs.writeFileSync(tmp, `${JSON.stringify(newState, null, 2)}\n`)
      fs.renameSync(tmp, options.filepath) // atomic replace on same filesystem
    }
    catch (error) {
      diagnostics.DF0035({ filepath: options.filepath, cause: error }, { method: 'error' })
    }
  }, debounceTime),
)
```

`rename` on the same directory is atomic on POSIX and Windows, so a reader never
sees a half-written file.

### Step 3: Tests

Add to `storage.test.ts` (model after the existing cases there):

1. **Round-trips atomically**: create storage in a temp dir with a small
   `debounce` (e.g. `debounce: 0` or `1`), mutate, wait for the write, then read
   the file back and assert it parses and matches the mutated state.
2. **A write failure does not throw**: point `filepath` at an un-writable
   location (e.g. a path whose parent is a file, or use `vi.spyOn(fs, 'renameSync')`
   / `'writeFileSync'` to throw once), mutate, and assert no unhandled rejection
   /throw escapes (the diagnostic is reported instead). Restore the spy after.

**Verify**: `pnpm exec vitest run packages/devframe/src/node/__tests__/storage.test.ts`
→ all pass.

## Test plan

- New: atomic round-trip produces valid JSON matching state; an injected write
  error is swallowed into a diagnostic (no throw).
- Existing storage tests keep passing (read-tolerance behavior unchanged).
- `pnpm --filter devframe typecheck` + `pnpm lint` clean.

## Done criteria

- [ ] A `DF00xx` storage-write-failure diagnostic exists in `node/diagnostics.ts`.
- [ ] The writer uses temp-file + `renameSync` and wraps the write in `try/catch` reporting that diagnostic.
- [ ] New tests pass; existing storage tests still pass.
- [ ] `pnpm --filter devframe typecheck` + `pnpm lint` exit 0.
- [ ] Only the 3 in-scope files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- The chosen `DF00xx` code is already defined (pick the next free one and note it).
- `renameSync` across the temp and target reveals a cross-device issue in the test
  environment (keep the temp file in the *same directory* as the target to avoid
  EXDEV — the snippet does this).

## Maintenance notes

- **Deferred**: flush-on-exit (a mutation within the trailing debounce window is
  still lost if the process exits before the timer fires). Fixing that cleanly
  needs a `flush()` on the storage handle + a caller-owned shutdown hook — a
  larger, opt-in change kept out of scope to respect headless-by-default. Note it
  for a follow-up.
- Reviewer: confirm the temp file shares the target's directory (atomic rename)
  and that the error path reports rather than throws.
- When `docs/` gains an error page for the new code, add `docs/errors/DF00xx.md`
  per the template (see plan 020's convention).
