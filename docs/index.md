---
layout: home

hero:
  name: Devframe
  text: Framework-neutral foundation for DevTools
  tagline: One devframe definition. Seven adapters. RPC, hosts, shared state, and agent-native — independent of Vite and any UI framework.
  image:
    src: /logo.svg
    alt: Devframe
    width: 240
  actions:
    - theme: brand
      text: Get Started
      link: /guide/
    - theme: alt
      text: View on GitHub
      link: https://github.com/devframes/devframe

features:
  - icon: 🧱
    title: One Definition, Many Deployments
    details: A single `defineDevframe` call deploys to CLI, static build, SPA, Vite plugin, embedded overlay, kit host, or MCP server.
    link: /guide/devframe-definition
  - icon: 🔌
    title: Type-safe RPC
    details: Bidirectional, schema-validated calls built on birpc + valibot. Query, static, action, and event function types.
    link: /guide/rpc
  - icon: 🔄
    title: Shared State
    details: Observable, patch-synced state that survives reconnects and bridges server and browser with structured updates.
    link: /guide/shared-state
  - icon: 🌊
    title: Streaming Channels
    details: One-way RPC streams and two-way upload channels for long-running data, progress reporting, and live feeds.
    link: /guide/streaming
  - icon: 🎨
    title: Bring Your Own UX
    details: Hooks like `onReady` and `cli.configure` let your app own banners, logging, and styling while Devframe owns the plumbing.
    link: /guide/
  - icon: 🤖
    title: Agent-Native (experimental)
    details: Surface RPC functions, tools, and resources to coding agents over MCP with a single `agent` field on each function.
    link: /guide/agent-native
---

## Built with Devframe

Real-world devtools shipping on Devframe:

- [**Vite DevTools**](https://devtools.vite.dev/) — the host that bundles multiple devframes into one UI (docks, command palette, terminals). Mount your own definition into it via the [`vite` adapter](/adapters/vite).
- [**ESLint Config Inspector**](https://github.com/eslint/config-inspector) — official ESLint tool for inspecting flat configs.
- [**node-modules-inspector**](https://github.com/antfu/node-modules-inspector) — interactive visualizer for your `node_modules` dependency graph.

End-to-end examples in this repo, exercising the full adapter surface:

- [**devframe-counter**](https://github.com/devframes/devframe/tree/main/examples/devframe-counter) — smallest possible demo, exercises all adapters.
- [**devframe-files-inspector**](https://github.com/devframes/devframe/tree/main/examples/devframe-files-inspector) — lists files in cwd via RPC; exercises CLI dev/build/spa surfaces.
- [**devframe-streaming-chat**](https://github.com/devframes/devframe/tree/main/examples/devframe-streaming-chat) — streams synthetic chat tokens from server to client via `ctx.rpc.streaming`.
