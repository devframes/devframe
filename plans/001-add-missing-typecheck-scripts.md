# Plan 001: Add the missing `typecheck` scripts so `turbo run typecheck` covers every package

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- plugins/inspect/package.json examples/*/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

The repo's own convention (`AGENTS.md` → "Development"): *"every workspace
package owns a `typecheck` script … add one to every new package so it can't
silently skip type errors."* `pnpm typecheck` runs `turbo run typecheck`, which
only runs the task in packages that **define** it (`turbo.json:5-7`). The
published package `@devframes/plugin-inspect` and 5 example packages have a
`tsconfig.json` but **no `typecheck` script**, so `pnpm typecheck` silently
skips them — a shipped plugin's types are never checked in CI. Adding the scripts
closes the hole so type regressions in those packages fail the one command
meant to catch them.

## Current state

Verified at `610a7b0`:

- Packages that **have** `"typecheck": "tsc --noEmit"`: `packages/devframe`,
  `packages/hub`, `packages/nuxt`, and all of `plugins/{a11y,code-server,git,messages,terminals}`.
- Packages that have a `tsconfig.json` but **no** `typecheck` script (the gap):
  - `plugins/inspect/package.json` — has `build`, `dev`, `test`; no `typecheck`.
  - `examples/files-inspector/package.json`
  - `examples/streaming-chat/package.json`
  - `examples/next-runtime-snapshot/package.json`
  - `examples/minimal-vite-devframe-hub/package.json`
  - `examples/minimal-next-devframe-hub/package.json`

`docs/` has no `tsconfig.json`, so it is intentionally excluded — do not add a
`typecheck` script to `docs/`.

Exemplar to copy exactly (`plugins/git/package.json` scripts block):

```jsonc
"scripts": {
  "build": "tsdown && pnpm run build:spa",
  "test": "vitest run",
  "typecheck": "tsc --noEmit",
  "dev": "node scripts/dev.mjs"
}
```

The `typecheck` script value is identical across all packages that have it:
`"tsc --noEmit"`. Each target package already has a `tsconfig.json` with an
explicit `include`, so no tsconfig changes are needed.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck one package | `pnpm --filter @devframes/plugin-inspect typecheck` | exit 0, no errors |
| Typecheck all | `pnpm typecheck` | exit 0, no errors, now runs 14 packages |
| Lint | `pnpm lint` | exit 0 |

Package names for `--filter` (from each `package.json` `"name"`):
`@devframes/plugin-inspect`, and the examples — read each example's
`package.json` `"name"` field (e.g. `files-inspector-example`,
`streaming-chat-example`, `next-runtime-snapshot-example`,
`minimal-vite-devframe-hub`, `minimal-next-devframe-hub`) — or just run the
whole-repo `pnpm typecheck` at the end.

## Scope

**In scope** (the only files you should modify):
- `plugins/inspect/package.json` (add `typecheck` script)
- `examples/files-inspector/package.json`
- `examples/streaming-chat/package.json`
- `examples/next-runtime-snapshot/package.json`
- `examples/minimal-vite-devframe-hub/package.json`
- `examples/minimal-next-devframe-hub/package.json`
- Type-error fixes **only within the above packages' own `src/`** if adding the
  script surfaces real type errors (see Step 3 + STOP conditions).

**Out of scope** (do NOT touch):
- Any change under `packages/*` or `plugins/*` other than `plugins/inspect` —
  they already typecheck; do not "fix" them here.
- `turbo.json` — no change needed; `typecheck` fans out via `dependsOn: ["^typecheck"]`.
- `docs/` — no tsconfig, intentionally excluded.
- Any tsconfig file — the includes are already correct.

## Git workflow

- Branch: `advisor/001-typecheck-scripts` (or the repo's convention).
- Commit style: conventional commits, e.g. `chore: add typecheck scripts to inspect plugin and examples`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the `typecheck` script to `plugins/inspect/package.json`

Insert `"typecheck": "tsc --noEmit"` into the `scripts` object, matching the
ordering/style of the exemplar (place it alongside `build`/`test`).

**Verify**: `pnpm --filter @devframes/plugin-inspect typecheck` → exit 0. If it
reports type errors, go to Step 3.

### Step 2: Add the `typecheck` script to each of the 5 example `package.json`s

Same one-line addition in each example's `scripts` object.

**Verify**: `pnpm typecheck` → the Turbo summary now lists the inspect plugin +
5 examples among the executed tasks (previously absent).

### Step 3: Resolve any type errors the new scripts surface

Adding coverage may reveal real, previously-hidden type errors in these
packages. Fix them **only within the offending package's own source** and only
when the fix is small and local (e.g. a missing type import, an obvious `as`
that should be a proper type, a genuinely wrong annotation).

If a package surfaces errors that would require changing a core package
(`packages/*` / another plugin) or a non-trivial refactor, STOP and report the
error list instead of forcing a fix — the script addition can ship for the
clean packages and the erroring one gets its own follow-up.

**Verify**: `pnpm typecheck` → exit 0 across all packages.

## Test plan

No new unit tests — this is tooling. The verification *is* the test:
- `pnpm typecheck` exits 0 and its Turbo output now includes the inspect plugin
  and all 5 examples.
- `pnpm lint` still exits 0 (JSON formatting of the edited `package.json`s is
  clean).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Each of the 6 in-scope `package.json` files has `"typecheck": "tsc --noEmit"`.
- [ ] `pnpm typecheck` exits 0.
- [ ] The Turbo `typecheck` run reports ≥ 14 successful tasks (8 prior + inspect + 5 examples).
- [ ] `pnpm lint` exits 0.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report (do not improvise) if:

- Adding a `typecheck` script surfaces type errors whose fix requires editing an
  out-of-scope file (`packages/*` or another plugin) or a non-trivial refactor.
- An example uses a build-tool type setup where `tsc --noEmit` is not the right
  checker (e.g. it needs `vue-tsc` / a framework typechecker) — report which and
  propose the correct command rather than forcing plain `tsc`.
- A target `package.json` no longer matches the "Current state" (already has a
  `typecheck` script, or the file was restructured).

## Maintenance notes

- Any *new* package added under `packages/*`, `plugins/*`, or `examples/*` must
  ship a `typecheck` script or it silently skips again — worth a lint/CI guard
  later (e.g. a script that asserts every workspace `package.json` with a
  `tsconfig.json` also has a `typecheck` script).
- A reviewer should confirm the Turbo run actually executed the newly-added
  tasks (check the task count/log), not just that the command exited 0.
