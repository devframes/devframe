---
title: 'Devframes'
navigation:
  icon: i-lucide-palette
description: 'Ready-to-run built-in example devframes. Compose your own DevTools solution from them, run one standalone, or read one as a reference for building your own.'
---

Ready-to-run built-in example devframes (`@devframes/plugin-*`). Compose your own DevTools solution from them, run one standalone, or read one as a reference for building your own.

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

## One RPC client, any framework

Each devframe picks its own UI framework yet shares one node-side API: [RPC](/guide/rpc), [shared state](/guide/shared-state), and `connectDevframe`.

## Running a built-in devframe

Most built-in devframes publish a `bin`:

```sh
pnpx @devframes/plugin-inspect      # the Devframe Inspector, standalone
pnpx @devframes/plugin-og           # inspect Open Graph metadata and social cards
pnpx @devframes/plugin-git          # the Git dashboard against the current repo
pnpx @devframes/plugin-assets       # manage the files under <cwd>/public
```

Each also exports a `create…Devframe` factory; see each page for options.
