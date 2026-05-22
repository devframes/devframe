---
outline: deep
---

# Built with Devframe

Real-world devtools shipping on Devframe:

- [**Vite DevTools**](https://devtools.vite.dev/) — the host that bundles multiple devframes into one UI (docks, command palette, terminals). Mount your own definition into it via the [`vite` adapter](/adapters/vite).
- [**ESLint Config Inspector**](https://github.com/eslint/config-inspector) — official ESLint tool for inspecting flat configs.
- [**node-modules-inspector**](https://github.com/antfu/node-modules-inspector) — interactive visualizer for your `node_modules` dependency graph.

End-to-end examples in this repo, exercising the full adapter surface:

- [**files-inspector**](https://github.com/devframes/devframe/tree/main/examples/files-inspector) — lists files in cwd via RPC; exercises CLI dev/build/spa surfaces.
- [**streaming-chat**](https://github.com/devframes/devframe/tree/main/examples/streaming-chat) — streams synthetic chat tokens from server to client via `ctx.rpc.streaming`.
- [**next-runtime-snapshot**](https://github.com/devframes/devframe/tree/main/examples/next-runtime-snapshot) — Next.js App Router SPA over RPC, surfacing the host Node runtime (system info, memory, env).
