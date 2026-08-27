---
title: 'Built-in Devframes'
navigation:
  icon: i-lucide-palette
description: 'Devframe also provides ready-to-run built-in example devframes. You can use them to compose your own DevTools solution, use them standalone, or as a reference for building your own devframe.'
---

Devframe also provides ready-to-run built-in example devframes. You can use them to compose your own DevTools solution, use them standalone, or as a reference for building your own devframe.

| Devframe | UI framework | What it does |
|--------|--------------|--------------|
| [Data Inspector](/plugins/data-inspector) | Vue | Query live server-side objects with jora. |
| [Devframe Inspector](/plugins/inspect) | Vue | Browse RPC, shared state, and agent exposure. |
| [Open Graph Viewer](/plugins/og) | Vue | Inspect Open Graph / Twitter metadata and card previews. |
| [Accessibility Inspector](/plugins/a11y) | Solid | Run axe-core; list WCAG violations. |
| [Git](/plugins/git) | React (Next.js) | Repository dashboard: status, graph, branches, diffs. |
| [Terminals](/plugins/terminals) | Svelte | Stream output and run interactive PTY shells. |
| [Code Server](/plugins/code-server) | Vue | Run VS Code in the browser. |
| [Assets](/plugins/assets) | Vue | Browse, preview, upload, rename, and delete files. |

## One RPC client, any framework

Each devframe picks its own UI framework yet shares one node-side API — [RPC](/guide/rpc), [shared state](/guide/shared-state), and `connectDevframe`.

## Running a built-in devframe

Most built-in devframes publish a `bin`:

```sh
pnpx @devframes/plugin-inspect      # the Devframe Inspector, standalone
pnpx @devframes/plugin-og           # inspect Open Graph metadata and social cards
pnpx @devframes/plugin-git          # the Git dashboard against the current repo
pnpx @devframes/plugin-assets       # manage the files under <cwd>/public
```

Each also exports a `create…Devframe` factory; see each page for options.
