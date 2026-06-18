# Plugin 03 — Git Dashboard

**Package:** `@devframes/plugin-git` · **Dir:** `plugins/git/`
**Inspiration:** GitLens — repository insight surfaced inline.
**SPA stack (Axis B):** Vue + Vite (reuses inspector UI primitives), vanilla
fallback acceptable.
**Diagnostics band:** `DF92xx`.

## What it does

A repository dashboard for the workspace: current branch + status (staged/
unstaged/untracked), recent commit log with author/date/message, per-file blame,
branch list, and a diff viewer. Read-only first; optional write actions
(stage/commit/checkout) behind explicit opt-in. The first "real product" tool, so
it exercises data-heavy RPC end to end.

## Dogfooding intent

Primary surface: **RPC `query`/`snapshot` + shared-state + long-lived file
watching + `json-render` + commands/docks**. Stresses:

- larger / structured RPC payloads (commit lists, diffs) and whether `snapshot:
  true` + the dump path handle them for `build`/`spa` modes;
- a long-lived watcher (repo HEAD / index changes) pushing shared-state updates,
  and the debounce behavior `createHubContext` applies in `dev` mode;
- `json-render` driven docks (`ctx.createJsonRenderer`) as an alternative to a
  full custom SPA for some panels;
- command-palette entries (`git:checkout`, `git:fetch`) via `ctx.commands`.

Expected gaps: efficient diffing of large repos over RPC, incremental updates vs.
full snapshots, and error diagnostics for non-repo / detached-HEAD states.

## Host integrations (Axis A)

- `.` — `createGitDevframe(options)` (repo root override, write-enabled flag).
- `/cli` — `npx @devframes/plugin-git` → standalone dashboard for cwd repo.
- `/vite`, `/nuxt` — mount into a host dev server (in-IDE-like sidebar).
- `/client` — Vue app + dock renderers.

## Package layout

```
plugins/git/
  src/
    index.ts
    node/index.ts
    client/index.ts
    cli.ts
    vite.ts
    nuxt.ts                 # optional
    rpc/
      index.ts
      functions/
        status.ts           # git:status        (query, snapshot)
        log.ts              # git:log            (query) — paginated
        diff.ts             # git:diff           (query)
        blame.ts            # git:blame          (query)
        branches.ts         # git:branches       (query)
        stage.ts            # git:stage          (action, write-gated)
        commit.ts           # git:commit         (action, write-gated)
        checkout.ts         # git:checkout       (action, write-gated)
    watcher.ts              # HEAD/index watcher → shared-state push
    spa/
  bin.mjs
  test/                     # use a temp git repo fixture
```

## Node side

- Git access via `simple-git` (or `isomorphic-git` for zero-binary portability —
  decide in milestone 0; add to the `deps` catalog). Run commands relative to
  `ctx.workspaceRoot` / `ctx.cwd`.
- Watcher updates `git:state` shared state (branch, ahead/behind, dirty counts) on
  `.git/HEAD` / index changes; debounced.
- Write RPCs only registered when `createGitDevframe({ write: true })`; otherwise
  omitted from the registry entirely (not just hidden). Diagnostics `DF92xx`:
  not-a-repo, dirty-tree-conflict, write-disabled.

## Client side

- Vue SPA: Status, History (commit graph/log), Diff, Branches, Blame views.
  Reuses table/tree/diff primitives; consider sharing with #1 if a UI kit emerges.

## Milestones

1. Scaffold. `git:status` + Status view (read-only).
2. `git:log` (paginated) + History; `git:diff` + Diff viewer.
3. Live `git:state` watcher → shared state.
4. `git:branches` + `git:blame`.
5. Opt-in write actions + command-palette entries.
6. tsnapi snapshot + e2e against a temp-repo fixture.

## Open questions / risks

- **`simple-git` (spawns `git`) vs `isomorphic-git` (pure JS).** Portability and
  the standalone `npx` story favor `isomorphic-git`; fidelity/perf favor
  `simple-git`. Decide in milestone 0.
- Diff/log payload size — paginate and/or stream; revisit whether `snapshot`
  scales for large repos.
- Whether to lean on `json-render` docks for simple panels (cheaper, no SPA build)
  vs. the full Vue SPA — good place to dogfood `createJsonRenderer`.
- Write actions are a footgun; default read-only, gate explicitly.
