---
outline: deep
---

# Built-in Plugins

Devframe ships a set of ready-to-run plugins. Each is a complete `DevframeDefinition` you can launch as a standalone CLI, mount into a Vite host, or dock inside a [hub](/guide/hub) — the same definition, deployed through any [adapter](/adapters/).

Each plugin is built with a **different UI framework**. That is deliberate: devframe's client layer (`connectDevframe`, [RPC](/guide/rpc), and [shared state](/guide/shared-state)) is framework-neutral, so every plugin author picks whatever they like for the SPA. The collection doubles as living proof that devframe leaves the framework choice entirely to the author.

| Plugin | UI framework | What it does |
|--------|--------------|--------------|
| [Data Inspector](./data-inspector) | Vue | Query live server-side objects with jora — sources contributed by plugins, hosts, data files, or attached processes. |
| [Devframe Inspector](./inspect) | Vue | Browse the RPC registry, invoke read-only queries, watch shared state update live, and explore the agent surface. |
| [Open Graph Viewer](./og) | Vue | Inspect Open Graph and Twitter metadata and compare social-card previews. |
| [Accessibility Inspector](./a11y) | Solid | Run axe-core against a host app, list WCAG violations, and highlight the offending element in the page on hover. |
| [Git](./git) | React (Next.js) | A repository dashboard — status, a commit graph, branches, and diffs, with optional staging and committing. |
| [Terminals](./terminals) | Svelte | Stream read-only command output and run fully interactive PTY shells in the browser. |
| [Code Server](./code-server) | Vanilla TypeScript | Launch code-server (VS Code in the browser) on demand and embed it in an auto-authenticated iframe. |

## One client, any framework

The collection spans Vue, Solid, React, Svelte, and framework-free TypeScript, yet every plugin shares the same node-side surface: register RPC functions, publish shared state, and connect from the browser with `connectDevframe`. Whatever renders the UI — a reactive framework or a handful of DOM calls — talks to the backend through the same protocol.

This is the framework-agnostic promise in practice. The browser bundle is the author's to choose; devframe handles the transport, the data model, the adapters, and the agent surface underneath.

## Running a plugin

Most plugins publish a `bin`, so the quickest path is `npx`:

```sh
npx @devframes/plugin-inspect      # the Devframe Inspector, standalone
npx @devframes/plugin-og           # inspect Open Graph metadata and social cards
npx @devframes/plugin-git          # the Git dashboard against the current repo
```

Each also exports a `create…Devframe` factory (or, for the Accessibility Inspector, a ready-made definition) you can drive through any adapter — see the individual pages for the factory name, options, and host-mount snippets.
