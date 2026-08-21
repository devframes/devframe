---
outline: deep
---

# Adapters

The lowest-level path is [the standard handler](./initiate), `initDevframe(def, { base })` — a Web Standard `(request: Request) => Promise<Response>` for any catch-all route. Every path below builds on it.

Adapters wrap it as `createXxx(def, options?)` at `devframe/adapters/<name>`. `cac` and `mcp` need an optional peer ([`cac`](https://github.com/cacjs/cac), [`@modelcontextprotocol/server`](https://github.com/modelcontextprotocol/typescript-sdk)).

## Comparison

| Entry point | Module | Factory | Best for |
|---------|-------|---------|----------|
| [Standard Handler](./initiate) | `devframe/initiate` | `initDevframe(def, { base })` | Raw handler |
| [`cac`](./cac) | `devframe/adapters/cac` | `createCac()` | Standalone tools |
| [`dev`](./dev) | `devframe/adapters/dev` | `createDevServer()` | Dev server |
| [`build`](./build) | `devframe/adapters/build` | `createBuild()` | Static snapshots |
| [`vite`](./vite) | `@vitejs/devtools-kit/node` | `createPluginFromDevframe()` | Vite DevTools |
| [`embedded`](./embedded) | `devframe/adapters/embedded` | `createEmbedded(def, { ctx })` | Runtime |
| [`mcp`](./mcp) | `devframe/adapters/mcp` | `createMcpServer()` | Coding agents |

## Mount paths

SPA basePath depends on the adapter:

| Adapter kind | Default basePath | Reason |
|--------------|------------------|--------|
| `cli`, `build` (standalone) | `/` | Owns the origin. |
| `vite`, `embedded` (hosted) | `/__<id>/` | Shares a host's origin. |

Override with `DevframeDefinition.basePath`:

```ts
defineDevframe({
  id: 'my-devframe',
  basePath: '/devframes/', // force this base regardless of adapter
  setup(ctx) { /* … */ },
})
```

The client discovers its SPA base at runtime — see [Client](/guide/client#runtime-basepath-discovery).
