# 03 - Stack, layout, and commands

## Stack

ESM TypeScript library. Bundled with `tsdown`. Tested with `vitest`. pnpm workspaces with catalog dependencies (`pnpm-workspace.yaml`); workspace globs reserve `playground`, `docs`, `packages/*`, `examples/*` for future additions.

Per-package layout:

- `src/` - library code; entry `src/index.ts`
- `test/` - vitest specs; API snapshots via `tsnapi` under `test/__snapshots__/`
- `dist/` - `tsdown` build output (shipped to the npm tarball via `files`)

## Commands

```sh
pnpm install      # requires pnpm@11.x
pnpm build        # tsdown
pnpm dev          # tsdown --watch
pnpm test         # pnpm build && vitest (api snapshot guards against stale dist)
pnpm typecheck    # turbo run typecheck (per-package tsc --noEmit)
pnpm lint --fix   # ESLint via @antfu/eslint-config
pnpm knip         # unused files/dependencies/exports across every workspace
pnpm start        # tsx src/index.ts
```

Before opening a PR, all five gates MUST pass:

```sh
pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build
```

Commits and PR titles MUST follow Conventional Commits (`feat:`, `fix:`, …).

## Testing

The `pnpm test` script intentionally runs `build` first so `tsnapi` snapshots compare against fresh `dist/`. `tsdown-stale-guard` enforces this in `test/api-snapshot.test.ts`.

## Typechecking

`pnpm typecheck` fans out through Turbo: every workspace package MUST own a `"typecheck": "tsc --noEmit"` script and its own `tsconfig.json` (extending `tsconfig.base.json` with an explicit `include`). Cross-package imports resolve to source through the `paths` aliases in `tsconfig.base.json`, so no prior build is needed. A new package under `packages/*` or `plugins/*` joins the fan-out the moment it ships that script - always add one so type errors can't be silently skipped.

`scripts/verify-typecheck-coverage.ts` runs first and fails the command (and CI, which just runs `pnpm typecheck`) if any workspace package has a `tsconfig.json` but no `typecheck` script. A package that genuinely can't typecheck yet needs a documented exception in that script, not a missing script.

## Generated artifacts under `src/`

Ahead-of-time build artifacts that live under `src/` - the shadow-root stylesheets in `packages/hub-ui/src/client/.generated/` and `packages/json-render-ui/src/.generated/` - are **generated, not committed** (`.generated` is gitignored). Each owning package builds its own with `pnpm run build:css`; three things guarantee the file is on disk before anything imports it: the root `postinstall` runs `turbo run build:css`, the Turbo `typecheck` task depends on both `build:css` tasks, and each package's `build` script chains `build:css` first. A new generated-under-`src` artifact MUST follow the same shape - its own build script, declared `outputs` in `turbo.json`, and a `typecheck` dependency - and MUST NOT be checked in: a minified single-line blob conflicts on every concurrent edit.

## `starter/`

The top-level, self-contained template for creating a new devframe (Vanilla TS, Vite SPA, playgrounds, tests). It uses real versions in its `package.json` (no catalogs, no `workspace:*`) so it is copy-paste ready for users; pnpm links its `devframe`/`@devframes/*` dependencies to the local workspace copies during development. When `bumpp -r` bumps the repo versions, `bumpp.config.ts` runs `scripts/sync-starter-version.ts` to update the starter's dependencies to match.

## knip

`pnpm knip` finds unused files, dependencies, and exports across every workspace (config in `knip.jsonc`), running against source directly - no prior build needed. Most workspaces need no configuration; `knip.jsonc` only carries per-workspace overrides for what knip's defaults can't infer:

- **Non-`index.ts` `exports` subpaths.** knip's package.json→`dist`→`src` source mapping needs a workspace `tsconfig.json` `outDir`, which conflicts with this repo's cross-workspace `src/*.ts` imports, so multi-entry packages list their `exports`-mapped entry files explicitly - keep that list in sync with each `tsdown.config.ts`.
- **Config files knip's plugins don't discover** in a nested location (a Next.js app rooted below the workspace root, `storybook-solidjs-vite` not matching the Storybook plugin trigger).
- **Dependencies referenced dynamically** outside the static import graph (icon collections consumed by UnoCSS at build time, built-in devframe packages loaded via a runtime `import()` string).

Prefer fixing the underlying gap or a scoped `ignoreDependencies`/`entry` override over a blanket `ignore`.
