# Plan 029: Bring `@devframes/plugin-git` up to the documented host-integration baseline

> **Executor instructions**: Follow this plan step by step. If a STOP condition
> occurs, stop and report. When done, update this plan's row in `plans/README.md`
> unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- plugins/git/package.json plugins/git/src tsconfig.base.json`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P3
- **Effort**: S-M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: direction / dx
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

`todos/README.md:43-52` sets the Axis-A baseline every plugin ships:
`.` + `/client` + `/cli` + `/vite`. Every other built plugin ships at least the
Vite baseline, but `plugins/git/package.json` exports **only `.`** — below its own
documented baseline. Git already has a working `bin.mjs` (`devframe-git`) and a
`cli.ts`, so the CLI exists but isn't exposed as a `/cli` subpath, and there's no
`/vite` host plugin — so git can't be mounted into a Vite host like the other
plugins. Closing this makes git a first-class, mountable plugin and a reference
for multi-host integration.

## Current state

`plugins/git/package.json:23-27`:

```jsonc
"exports": {
  ".": "./dist/index.mjs",
  "./package.json": "./package.json"
},
"bin": { "devframe-git": "./bin.mjs" },
```

- Git has `src/cli.ts` and `bin.mjs` (the standalone CLI works) but no `/cli`
  export; no `src/vite.ts`; no `/client` export.
- Contrast a plugin that ships the baseline (read `plugins/a11y/package.json` and
  `plugins/inspect/package.json` `exports` + their `src/vite.ts`, `src/cli.ts`,
  `src/client/index.ts`) as the model.
- `tsconfig.base.json` already has source-path aliases for other plugins' subpaths
  (e.g. `@devframes/plugin-a11y/vite`) — git currently lists only `@devframes/plugin-git`.
- Git's SPA is Next.js (`package.json` description + `build:spa` = `next build`),
  so a `/vite` host plugin mounts the built SPA the same way other plugins do
  (serve the `dist` SPA + bridge RPC), not by building the SPA with Vite.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Build | `pnpm --filter @devframes/plugin-git build` | exit 0, emits the new entry outputs |
| Typecheck | `pnpm --filter @devframes/plugin-git typecheck` | exit 0 |
| Test | `pnpm exec vitest run plugins/git/test` | all pass |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `plugins/git/package.json` (add `/client`, `/cli`, `/vite` exports; update `files`/types as needed)
- `plugins/git/src/vite.ts` (create — a `viteDevBridge`-based host plugin, mirror another plugin's `vite.ts`)
- `plugins/git/src/client/index.ts` (create/expose if not already present — the `/client` surface)
- `plugins/git/tsdown.config.ts` (add the new entry points)
- `tsconfig.base.json` (add `@devframes/plugin-git/{client,cli,vite}` source aliases)

**Out of scope**: `/nuxt`,`/next`,`/rspack`,`/webpack` (opt-in, later); changing
the git RPC behavior; the SPA framework.

## Git workflow

- Branch: `advisor/029-git-host-baseline`.
- Commit style: `feat(plugin-git): ship the /client + /cli + /vite host-integration baseline`.

## Steps

1. **Study the model**: read a baseline plugin's `package.json` exports,
   `tsdown.config.ts`, `src/vite.ts`, `src/cli.ts`, `src/client/index.ts` (e.g.
   `plugins/a11y` or `plugins/inspect`). Note how `/vite` uses the devframe Vite
   bridge to mount the plugin into a host dev server.
2. **Add entries**: create `src/vite.ts` (mirror the model's viteDevBridge host
   plugin, pointed at git's definition + built SPA) and expose `src/client/index.ts`.
   Ensure `src/cli.ts` is export-ready.
3. **Wire the build**: add the new entries to `plugins/git/tsdown.config.ts`
   (matching the three-config browser/node/dts pattern) so `dist` emits `client`,
   `cli`, `vite` outputs with types.
4. **Update `package.json`**: add `exports` for `./client`, `./cli`, `./vite`
   (pointing at the emitted `dist/*.mjs` + `.d.mts`), keep `.` and `./package.json`.
5. **Add source aliases**: in `tsconfig.base.json`, add
   `@devframes/plugin-git/client`, `/cli`, `/vite` → their `src/*` paths (mirroring
   the other plugins' blocks).
6. **Verify**: build, typecheck, test, lint all green; confirm the new subpaths
   import cleanly (e.g. a scratch `import { … } from '@devframes/plugin-git/vite'`
   type-resolves).

## Done criteria

- [ ] `plugins/git/package.json` exports `.`, `./client`, `./cli`, `./vite`, `./package.json`.
- [ ] `src/vite.ts` (and `/client` surface) exist and build; `dist` emits the entries with `.d.mts`.
- [ ] `tsconfig.base.json` has the three new git subpath aliases.
- [ ] `pnpm --filter @devframes/plugin-git build` + `typecheck` exit 0; git tests + `pnpm lint` pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:
- Git's Next-built SPA can't be mounted by the standard `/vite` host bridge the
  other (Vite-SPA) plugins use — report how the SPA is served (it's a static
  `dist` either way) and adapt the `vite.ts` to serve the built assets.
- Adding entries changes the `tsnapi` API snapshots — reconcile them intentionally.

## Maintenance notes

- This is the reference for later `/next`/`/nuxt` additions (plan 027) on the
  data-rich plugins.
- Reviewer: confirm each new subpath both builds (`dist`) and resolves in-repo
  (alias) — the two must stay in sync.
