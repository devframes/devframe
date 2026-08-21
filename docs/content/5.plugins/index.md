---
title: 'Built-in Plugins'
description: 'Devframe ships ready-to-run plugins. Each is a complete DevframeDefinition — launch it standalone, mount it into a Vite host, or dock it inside a hub through any adapter.'
---

Devframe ships ready-to-run plugins. Each is a complete `DevframeDefinition` — launch it standalone, mount it into a Vite host, or dock it inside a [hub](/guide/hub) through any [adapter](/adapters).

| Plugin | UI framework | What it does |
|--------|--------------|--------------|
| [Data Inspector](/plugins/data-inspector) | Vue | Query live server-side objects with jora. |
| [Devframe Inspector](/plugins/inspect) | Vue | Browse RPC, shared state, and agent surface. |
| [Open Graph Viewer](/plugins/og) | Vue | Inspect Open Graph / Twitter metadata and card previews. |
| [Accessibility Inspector](/plugins/a11y) | Solid | Run axe-core; list WCAG violations. |
| [Git](/plugins/git) | React (Next.js) | Repository dashboard: status, graph, branches, diffs. |
| [Terminals](/plugins/terminals) | Svelte | Stream output and run interactive PTY shells. |
| [Code Server](/plugins/code-server) | Vue | Run VS Code in the browser. |
| [Assets](/plugins/assets) | Vue | Browse, preview, upload, rename, and delete files. |

## One client, any framework

Each plugin picks its own UI framework yet shares one node-side surface — [RPC](/guide/rpc), [shared state](/guide/shared-state), and `connectDevframe`.

## Running a plugin

Most plugins publish a `bin`:

```sh
pnpx @devframes/plugin-inspect      # the Devframe Inspector, standalone
pnpx @devframes/plugin-og           # inspect Open Graph metadata and social cards
pnpx @devframes/plugin-git          # the Git dashboard against the current repo
pnpx @devframes/plugin-assets       # manage the files under <cwd>/public
```

Each also exports a `create…Devframe` factory; see each page for options.
