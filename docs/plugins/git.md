---
outline: deep
---

# Git

A repository dashboard built as a **Next.js (App Router) + shadcn/ui** SPA over type-safe RPC. The host process shells out to `git` and exposes the repository; the same bundle runs as a live dev server or a fully static deployment, and follows the system light / dark preference.

Package: `@devframes/plugin-git` · framework: **React (Next.js) + shadcn/ui**

## What it does

Status, a SourceTree-style commit graph, branches, and diffs are read-only. Staging, unstaging, and committing become available when write mode is enabled — and stay gated behind the repository's actual write permission in the UI.

## Standalone

```sh
pnpx @devframes/plugin-git         # dev server (live RPC over WebSocket)
pnpx @devframes/plugin-git --write # also enable staging / committing from the UI
pnpx @devframes/plugin-git build   # static deploy → dist-static/
```

## Programmatic

`createGitDevframe(options)` returns a definition you can mount into any host or drive yourself:

```ts
import { createGitDevframe } from '@devframes/plugin-git'
import { createCac } from 'devframe/adapters/cac'

await createCac(createGitDevframe({ repoRoot: process.cwd() })).parse()
```

| Option | Default | Description |
|--------|---------|-------------|
| `repoRoot` | the devframe `cwd` | Repository directory to inspect. |
| `port` | `9710` | Preferred dev-server port. |
| `write` | `false` | Enable staging, unstaging, and committing from the UI. |

## RPC surface

The read functions are each a `query` with `snapshot: true` — resolved live over WebSocket in dev, and served from a snapshot baked at build time for static deploys. Each degrades to an empty, `isRepo: false` result outside a git repository.

- `devframes:plugin:git:status` — branch, upstream tracking, and staged / unstaged / untracked files.
- `devframes:plugin:git:log` — paginated commit history including parent hashes, which drive the commit graph.
- `devframes:plugin:git:branches` — local branches with SHA, upstream, ahead / behind, and tip subject.
- `devframes:plugin:git:diff` — per-file added / deleted counts plus a unified patch for a selected file.

Write actions (`devframes:plugin:git:stage`, `devframes:plugin:git:unstage`, `devframes:plugin:git:commit`) are `action` functions, registered only when write mode is enabled.

## Source

[`plugins/git`](https://github.com/devframes/devframe/tree/main/plugins/git)
