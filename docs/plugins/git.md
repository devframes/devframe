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
npx devframe-git              # dev server (live RPC over WebSocket)
npx devframe-git --write      # also enable staging / committing from the UI
npx devframe-git build        # static deploy → dist-static/
```

## Programmatic

`createGitDevframe(options)` returns a definition you can mount into any host or drive yourself:

```ts
import { createGitDevframe } from '@devframes/plugin-git'
import { createCli } from 'devframe/adapters/cli'

await createCli(createGitDevframe({ repoRoot: process.cwd() })).parse()
```

| Option | Default | Description |
|--------|---------|-------------|
| `repoRoot` | the devframe `cwd` | Repository directory to inspect. |
| `port` | `9710` | Preferred dev-server port. |
| `write` | `false` | Enable staging, unstaging, and committing from the UI. |

## RPC surface

The read functions are each a `query` with `snapshot: true` — resolved live over WebSocket in dev, and served from a snapshot baked at build time for static deploys. Each degrades to an empty, `isRepo: false` result outside a git repository.

- `git:status` — branch, upstream tracking, and staged / unstaged / untracked files.
- `git:log` — paginated commit history including parent hashes, which drive the commit graph.
- `git:branches` — local branches with SHA, upstream, ahead / behind, and tip subject.
- `git:diff` — per-file added / deleted counts plus a unified patch for a selected file.

Write actions (`git:stage`, `git:unstage`, `git:commit`) are `action` functions, registered only when write mode is enabled.

## Source

[`plugins/git`](https://github.com/devframes/devframe/tree/main/plugins/git)
