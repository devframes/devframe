---
title: 'Adapters'
navigation:
  icon: i-lucide-plug
description: 'The lowest-level path is the standard handler, initDevframe(def, { base }) - a Web Standard (request: Request) => Promise<Response> for any catch-all route. Every path below builds on it.'
---

The lowest-level path is [the standard handler](/adapters/initiate), `initDevframe(def, { base })` - a Web Standard `(request: Request) => Promise<Response>` for any catch-all route. Every path below builds on it.

Adapters wrap it as `createXxx(def, options?)` at `devframe/adapters/<name>`. `cac` and `mcp` need an optional peer ([`cac`](https://github.com/cacjs/cac), [`@modelcontextprotocol/server`](https://github.com/modelcontextprotocol/typescript-sdk)).

## Comparison

| Entry point | Module | Factory | Best for |
|---------|-------|---------|----------|
| [Standard Handler](/adapters/initiate) | `devframe/initiate` | `initDevframe(def, { base })` | Raw handler |
| [`cac`](/adapters/cac) | `devframe/adapters/cac` | `createCac()` | Standalone tools |
| [`dev`](/adapters/dev) | `devframe/adapters/dev` | `createDevServer()` | Dev server |
| [`build`](/adapters/build) | `devframe/adapters/build` | `createBuild()` | Static snapshots |
| [`vite`](/adapters/vite) | `@vitejs/devtools-kit/node` | `createPluginFromDevframe()` | Vite DevTools |
| [`embedded`](/adapters/embedded) | `devframe/adapters/embedded` | `createEmbedded(def, { ctx })` | Runtime |
| [`mcp`](/adapters/mcp) | `devframe/adapters/mcp` | `createMcpServer()` | Coding agents |

## Mount paths

SPA basePath depends on the adapter:

| Adapter kind | Default basePath | Reason |
|--------------|------------------|--------|
| `cli`, `build` (standalone) | `/` | Owns the origin. |
| `vite`, `embedded` (hosted) | `/__<id>/` | Shares a host framework's origin. |

Override with `DevframeDefinition.basePath`:

```ts
defineDevframe({
  id: 'my-tool',
  basePath: '/devframes/', // force this base regardless of adapter
  setup(ctx) { /* … */ },
})
```

The SPA discovers its base at runtime - see [Client](/guide/client#runtime-basepath-discovery).
