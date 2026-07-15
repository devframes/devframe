---
outline: deep
---

# Adapters

An adapter takes a `DevframeDefinition` and deploys it into a specific runtime — a standalone CLI, a Vite plugin, a static snapshot, an embedded host, or an MCP server. Each adapter ships at its own entry point (`devframe/adapters/<name>`); the bundler pulls in only the ones you use.

Every adapter factory has the shape `createXxx(devframeDef, options?)`. Some adapters draw on an optional peer dependency, installed only when you opt into that adapter: `cac` pulls in [`cac`](https://github.com/cacjs/cac), and `mcp` pulls in [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk).

## Comparison

| Adapter | Entry | Factory | Best for |
|---------|-------|---------|----------|
| [`cac`](./cac) | `devframe/adapters/cac` | `createCac(def, options?)` | Standalone tools run via `node ./my-tool.js` |
| [`dev`](./dev) | `devframe/adapters/dev` | `createDevServer(def, options?)` | Run the dev server programmatically — drive it from any CLI framework |
| [`build`](./build) | `devframe/adapters/build` | `createBuild(def, options?)` | Offline reports, CI artifacts, deployable SPA snapshots |
| [`vite`](./vite) | `@vitejs/devtools-kit/node` | `createPluginFromDevframe(def, options?)` | Mount the definition into Vite DevTools (or any compatible host) |
| [`embedded`](./embedded) | `devframe/adapters/embedded` | `createEmbedded(def, { ctx })` | Runtime registration into an already-running host |
| [`mcp`](./mcp) | `devframe/adapters/mcp` | `createMcpServer(def, options?)` | Exposing a devframe to coding agents |

## Mount paths

A devframe's SPA basePath depends on which adapter is running it:

| Adapter kind | Default basePath | Reason |
|--------------|------------------|--------|
| `cli`, `spa`, `build` (standalone) | `/` | The devframe owns the origin. |
| `vite`, `embedded` (hosted) | `/__<id>/` | The devframe shares the origin with a host app and namespaces itself. |

Override either side explicitly with `DevframeDefinition.basePath`:

```ts
defineDevframe({
  id: 'my-devframe',
  basePath: '/devframes/', // force this base regardless of adapter
  setup(ctx) { /* … */ },
})
```

SPA authors should build with relative asset paths (`vite.base: './'`); the client resolves its connection descriptor relative to the page at runtime. See [Client](/guide/client#runtime-basepath-discovery) for the discovery rules.
