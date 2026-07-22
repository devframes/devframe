# @devframes/plugin-git

> [!WARNING] Experimental
> This plugin is experimental and may change without a major version bump until
> it stabilizes.

Git integration for [devframe](https://github.com/devframes/devframe) — a
repository dashboard with a **Next.js App Router + shadcn/ui** SPA over
type-safe RPC. The host process shells out to `git` and exposes the repository;
the same bundle runs as a live dev server or a fully static deployment.

Status, a SourceTree-style **commit graph**, branches, and diffs are read-only;
staging, unstaging, and committing are available when write mode is enabled. The
UI follows the system **light/dark** preference with a manual toggle.

## Install

```sh
npm i -D @devframes/plugin-git
```

## Standalone CLI

Run the dashboard against the current repository:

```sh
pnpx @devframes/plugin-git         # dev server (live RPC over WebSocket)
pnpx @devframes/plugin-git --write # also enable staging / committing from the UI
pnpx @devframes/plugin-git build   # static deploy → dist-static/
pnpx @devframes/plugin-git --port 4000
```

## Programmatic

`createGitDevframe(options)` returns a devframe definition you can mount into
any host with devframe's adapters, or drive yourself.

```ts
import { createGitDevframe } from '@devframes/plugin-git'
import { createCac } from 'devframe/adapters/cac'

await createCac(createGitDevframe({ repoRoot: process.cwd() })).parse()
```

| Option | Default | Description |
|--------|---------|-------------|
| `repoRoot` | the devframe `cwd` | Repository directory to inspect. |
| `basePath` | adapter-resolved | Mount path (`/` standalone, `/__git/` hosted). |
| `distDir` | bundled SPA | Override the served SPA directory. |
| `port` | `9710` | Preferred dev-server port. |
| `write` | `false` | Enable staging, unstaging, and committing from the UI. |

## RPC surface

The read functions are each a `query` with `snapshot: true`: resolved live over
WebSocket in dev, and served from a snapshot baked at build time for static
deploys. Each degrades to an empty, `isRepo: false` result outside a git
repository.

- `devframes:plugin:git:status` — branch, upstream tracking (ahead/behind), staged / unstaged /
  untracked files, parsed from `git status --porcelain=v2`. Reports `canWrite`.
- `devframes:plugin:git:log` — paginated commit history (`limit` / `skip`) including parent
  hashes, which drive the commit graph.
- `devframes:plugin:git:branches` — local branches with SHA, upstream, ahead/behind, tip subject.
- `devframes:plugin:git:diff` — per-file added/deleted counts for the working tree or index, plus
  a unified patch for a selected file.

Write actions are `action` functions, registered only when write mode is enabled
(`createGitDevframe({ write: true })` or the `--write` flag) and gated behind
`status.canWrite` in the UI. Each returns fresh status (commit returns a result):

- `devframes:plugin:git:stage` — `git add` the given paths.
- `devframes:plugin:git:unstage` — `git restore --staged` the given paths.
- `devframes:plugin:git:commit` — commit the staged changes with a message.

## Develop

```sh
pnpm -C plugins/git dev     # client (Next.js HMR) + RPC backend together
pnpm -C plugins/git build   # tsdown (node) + next build (SPA) → dist/
```

`pnpm dev` starts the Next.js dev server (with hot-reload) and the devframe
RPC/WebSocket backend at the same time, then prints both URLs — open the UI one.
The SPA connects to the backend over the WebSocket port carried in
`NEXT_PUBLIC_DEVFRAME_WS`. Override ports with `PORT` (UI) and
`DEVFRAME_GIT_PORT` (backend). Run a single side with `dev:client` or
`dev:server`.

The SPA is a standard shadcn/ui setup (Tailwind v4, `components/ui/*`). Three
Next.js settings in `src/client/next.config.mjs` keep it portable: `output:
'export'` (devframe owns the server), `assetPrefix: '.'` (relative assets so the
same bundle works at any base), and `trailingSlash: true` (composes with
devframe's static directory-with-index resolution).
