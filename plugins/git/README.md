# @devframes/plugin-git

Git integration for [devframe](https://github.com/devframes/devframe) — a
read-only repository dashboard (status, log, branches, diff) with a **Next.js
App Router + shadcn/ui** SPA over type-safe RPC. The host process shells out to
`git` and exposes the repository; the same bundle runs as a live dev server or
a fully static deployment.

## Install

```sh
npm i -D @devframes/plugin-git
```

## Standalone CLI

Run the dashboard against the current repository:

```sh
npx devframe-git              # dev server (live RPC over WebSocket)
npx devframe-git build        # static deploy → dist-static/
npx devframe-git --port 4000
```

## Programmatic

`createGitDevframe(options)` returns a devframe definition you can mount into
any host with devframe's adapters, or drive yourself.

```ts
import { createGitDevframe } from '@devframes/plugin-git'
import { createCli } from 'devframe/adapters/cli'

await createCli(createGitDevframe({ repoRoot: process.cwd() })).parse()
```

| Option | Default | Description |
|--------|---------|-------------|
| `repoRoot` | the devframe `cwd` | Repository directory to inspect. |
| `basePath` | adapter-resolved | Mount path (`/` standalone, `/__git/` hosted). |
| `distDir` | bundled SPA | Override the served SPA directory. |
| `port` | `9710` | Preferred dev-server port. |

## RPC surface

Every function is a `query` with `snapshot: true`: resolved live over WebSocket
in dev, and served from a snapshot baked at build time for static deploys. Each
degrades to an empty, `isRepo: false` result outside a git repository.

- `git:status` — branch, upstream tracking (ahead/behind), staged / unstaged /
  untracked files, parsed from `git status --porcelain=v2`.
- `git:log` — paginated commit history (`limit` / `skip`).
- `git:branches` — local branches with SHA, upstream, ahead/behind, tip subject.
- `git:diff` — per-file added/deleted counts for the working tree or index, plus
  a unified patch for a selected file.

## Develop

```sh
pnpm -C plugins/git build       # tsdown (node) + next build (SPA) → dist/
pnpm -C plugins/git next:dev    # Next.js HMR for the SPA
pnpm -C plugins/git dev         # run the CLI dev server from source
```

The SPA is a standard shadcn/ui setup (Tailwind v4, `components/ui/*`). Three
Next.js settings in `src/client/next.config.mjs` keep it portable: `output:
'export'` (devframe owns the server), `assetPrefix: '.'` (relative assets so the
same bundle works at any base), and `trailingSlash: true` (composes with
devframe's static directory-with-index resolution).
