# @devframes/plugin-git

> [!WARNING] Experimental
> This devframe is experimental and may change without a major version bump until
> it stabilizes.

A git devframe built on [devframe](https://github.com/devframes/devframe) - a
repository dashboard with a **Next.js App Router + shadcn/ui** SPA over
type-safe RPC. The node side shells out to `git` and exposes the repository;
the same bundle runs as a live dev server or a fully static deployment.

Status, a SourceTree-style **commit graph**, branches, and diffs, plus staging,
unstaging, and committing - all through the shared
[`@devframes/service-git`](../../services/git) wire service. The UI follows the
system **light/dark** preference with a manual toggle.

## Install

```sh
npm i -D @devframes/plugin-git
```

## Standalone CLI

Run the dashboard against the current repository:

```sh
pnpx @devframes/plugin-git         # dev server (live RPC over WebSocket)
pnpx @devframes/plugin-git build   # static deploy → dist-static/
pnpx @devframes/plugin-git --port 4000
```

## Programmatic

`createGitDevframe(options)` returns a devframe definition you can mount into
any host framework with devframe's adapters, or drive yourself.

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

## RPC

All git work runs through the [`@devframes/service-git`](../../services/git)
wire service, which this devframe declares (`services`) and its SPA calls
directly over `devframes:service:git:*`. The read functions are `query`
functions that degrade to an empty, `isRepo: false` result outside a git
repository; the definition opts them into the static build via `rpc.snapshot`
(resolved live over WebSocket in dev, served from a build-time snapshot for
static deploys).

- `devframes:service:git:status` - branch, upstream tracking (ahead/behind), staged / unstaged /
  untracked files, parsed from `git status --porcelain=v2`.
- `devframes:service:git:log` - paginated commit history (`limit` / `skip`) including parent
  hashes, which drive the commit graph.
- `devframes:service:git:branches` - local branches with SHA, upstream, ahead/behind, tip subject.
- `devframes:service:git:diff` - per-file added/deleted counts for the working tree or index, plus
  a unified patch for a selected file.

Write actions are `action` functions - always exposed by the service, with
write authorization governed by the connection-trust boundary. Each
returns fresh status (commit returns a result):

- `devframes:service:git:stage` - `git add` the given paths.
- `devframes:service:git:unstage` - `git restore --staged` the given paths.
- `devframes:service:git:commit` - commit the staged changes with a message.

## Develop

```sh
pnpm -C plugins/git dev     # client (Next.js HMR) + RPC backend together
pnpm -C plugins/git build   # tsdown (node) + next build (SPA) → dist/
```

`pnpm dev` starts the Next.js dev server (with hot-reload) and the devframe
RPC/WebSocket backend at the same time, then prints both URLs - open the UI one.
The SPA connects to the backend over the WebSocket port carried in
`NEXT_PUBLIC_DEVFRAME_WS`. Override ports with `PORT` (UI) and
`DEVFRAME_GIT_PORT` (backend). Run a single side with `dev:client` or
`dev:server`.

The SPA is a standard shadcn/ui setup (Tailwind v4, `components/ui/*`). Three
Next.js settings in `src/client/next.config.mjs` keep it portable: `output:
'export'` (devframe owns the server), `assetPrefix: '.'` (relative assets so the
same bundle works at any base), and `trailingSlash: true` (composes with
devframe's static directory-with-index resolution).
