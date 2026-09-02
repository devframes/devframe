---
title: 'Add-ons'
navigation:
  icon: i-lucide-blocks
description: 'Ready-to-run packages built on Devframe: built-in devframes you can run, compose, or learn from, and wire services that share one node-side capability across every devframe on a host.'
---

Ready-to-run packages built on Devframe, in two families:

- **[Devframes](/add-ons/devframes)** - complete built-in devtools (`@devframes/plugin-*`). Run one standalone, compose several into your own DevTools, or read one as a reference for building your own.
- **[Services](/add-ons/services)** - wire services (`@devframes/service-*`): one node-side capability installed once per host and consumed by every devframe and RPC client, without re-bundling it.

## Devframes

Complete tools, each picking its own UI framework yet sharing one node-side API - [RPC](/guide/rpc), [shared state](/guide/shared-state), and `connectDevframe`.

| Devframe | UI framework | What it does |
|--------|--------------|--------------|
| [Data Inspector](/add-ons/devframes/data-inspector) | Vue | Query live server-side objects with jora. |
| [Devframe Inspector](/add-ons/devframes/inspect) | Vue | Browse RPC, shared state, and agent exposure. |
| [Open Graph Viewer](/add-ons/devframes/og) | Vue | Inspect Open Graph / Twitter metadata and card previews. |
| [Accessibility Inspector](/add-ons/devframes/a11y) | Solid | Run axe-core; list WCAG violations. |
| [Git](/add-ons/devframes/git) | React (Next.js) | Repository dashboard: status, graph, branches, diffs. |
| [Terminals](/add-ons/devframes/terminals) | Svelte | Stream output and run interactive PTY shells. |
| [Code Server](/add-ons/devframes/code-server) | Vue | Run VS Code in the browser. |
| [Assets](/add-ons/devframes/assets) | Vue | Browse, preview, upload, rename, and delete files. |

## Services

Shared node-side capabilities other devframes install and consume - see [Cross-Devframe Services](/guide/services) for the mechanism, and the [Node-Side API reference](/references/node-api#devframeserviceshost) for the host API.

| Service | Scope | What it does |
|---------|-------|--------------|
| [Open](/add-ons/services/open) (`@devframes/service-open`) | `devframes:service:open` | Open files in an editor or the OS explorer, with workspace-root containment. |
| [Git](/add-ons/services/git) (`@devframes/service-git`) | `devframes:service:git` | Typed read/write git operations over RPC on one repo. |
| [Shiki](/add-ons/services/shiki) (`@devframes/service-shiki`) | `devframes:service:shiki` | Node-side [Shiki](https://shiki.style) syntax highlighting, cached and dual-theme. |

## Running a built-in devframe

Most built-in devframes publish a `bin`:

```sh
pnpx @devframes/plugin-inspect      # the Devframe Inspector, standalone
pnpx @devframes/plugin-og           # inspect Open Graph metadata and social cards
pnpx @devframes/plugin-git          # the Git dashboard against the current repo
pnpx @devframes/plugin-assets       # manage the files under <cwd>/public
```

Each also exports a `create…Devframe` factory; see each page for options.
