---
outline: deep
---

# Git

A repository dashboard — a **Next.js + shadcn/ui** SPA that shells out to `git`. The same bundle runs live or static.

Package: `@devframes/plugin-git`

<figure class="screenshot">
  <img src="/screenshots/plugin-git-1.png" alt="Git plugin" />
  <figcaption>Status and graph</figcaption>
</figure>

## What it does

Read views are read-only; write mode adds staging, unstaging, and commits (gated by write permission).

## Standalone

```sh
pnpx @devframes/plugin-git         # dev server (live RPC over WebSocket)
pnpx @devframes/plugin-git --write # also enable staging / committing from the UI
pnpx @devframes/plugin-git build   # static deploy → dist-static/
```

## Programmatic

`createGitDevframe(options)` returns a definition for any adapter.

```ts
import { createGitDevframe } from '@devframes/plugin-git'
import { createCac } from 'devframe/adapters/cac'

await createCac(createGitDevframe({ repoRoot: process.cwd() })).parse()
```

| Option | Default | Description |
|--------|---------|-------------|
| `repoRoot` | the devframe `cwd` | Repo to inspect. |
| `port` | `9710` | Dev-server port. |
| `write` | `false` | Enable staging / unstaging / commits. |

## RPC surface

Namespaced `devframes:plugin:git:*`. Reads — `status`, `log` (+ parent hashes), `branches` (ahead / behind), `diff` (unified patch) — are `query` (`snapshot: true`): live in dev, baked static, `isRepo: false` outside a repo. Write `stage` / `unstage` / `commit` are write-mode `action`s.

## Source

[`plugins/git`](https://github.com/devframes/devframe/tree/main/plugins/git)
