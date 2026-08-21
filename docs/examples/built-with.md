---
outline: deep
---

# Built with Devframe

Real-world devframes:

- [**Vite DevTools**](https://devtools.vite.dev/) — bundles multiple devframes into one UI. Mount your own via the [`vite` adapter](/adapters/vite).
- [**ESLint Config Inspector**](https://github.com/eslint/config-inspector) — inspecting flat configs.
- [**node-modules-inspector**](https://github.com/antfu/node-modules-inspector) — visualizer for your `node_modules` dependency graph.

End-to-end examples in this repo:

- [**files-inspector**](https://github.com/devframes/devframe/tree/main/examples/files-inspector) — lists cwd files via RPC; CLI dev/build.
- [**streaming-chat**](https://github.com/devframes/devframe/tree/main/examples/streaming-chat) — streams chat tokens server → client via `ctx.rpc.streaming`.
- [**next-runtime-snapshot**](https://github.com/devframes/devframe/tree/main/examples/next-runtime-snapshot) — Next.js App Router SPA over RPC, surfacing the host Node runtime.
