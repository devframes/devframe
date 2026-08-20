---
outline: deep
---

# Introduction

**Devframe is a framework-neutral foundation for building a devtool once, then bringing it to different hosts, standalone surfaces, and agents.** You describe a single tool — its RPC surface, its shared state, its web interface, its diagnostics, and its agent-facing surface — and the same definition mounts almost anywhere.

Think of Devframe as [`unplugin`](https://unplugin.unjs.io/) for devtools. Where `unplugin` gives plugins a common interface across bundlers, Devframe gives devtools a common definition and a standard way to be mounted into different environments.

## The shared boundary

Most devtools — inspectors, asset viewers, build analyzers, terminals, editor integrations — rebuild the same infrastructure: server–client communication, state synchronization, serialization, static asset hosting, and a web interface. Each one also has to decide, again, how to be embedded, standalone, deployable, or integrated into a larger devtools experience. That work is usually coupled to one framework and to how its dev server serves assets, handles requests, and upgrades connections, so similar features get rebuilt separately across the ecosystem.

Devframe frees a devtool from those framework-specific boundaries. A capability is defined once and can run on every supported host, so communities can improve one tool together instead of maintaining parallel versions of the same idea.

## One definition, one standard handler

Every devframe starts with [`defineDevframe()`](./devframe-definition). At its core it associates the identity of a tool with the capabilities it provides:

```ts
import { defineDevframe } from 'devframe'
import { inspectProject } from './rpc'

export default defineDevframe({
  id: 'my-tool',
  name: 'My Tool',
  // package metadata and client entry omitted…
  setup(ctx) {
    ctx.scope('my-tool').rpc.register(inspectProject)
  },
})
```

The definition is independent of its presentation. [`initDevframe()`](/adapters/initiate) turns it into a live instance whose `handler` is a Web Standard `(request: Request) => Promise<Response>`:

```ts
import { initDevframe } from 'devframe/initiate'
import devframe from './devframe'

const devtools = initDevframe(devframe, { base: '/__my-tool/' })

devtools.handler
// (request: Request) => Promise<Response>

devtools.nodeMiddleware
// (req, res, next) => void — for Connect-style servers (Vite, Rsbuild)
```

Behind this handler, Devframe serves the tool's web interface, connection metadata, live RPC, authentication, and the optional MCP endpoint under one namespace. The tool is no longer tied to a particular dev-server API; its boundary is the Web Standard `Request` and `Response`.

Modern frameworks and runtimes already converge on that boundary. Hono and Nitro work with Web Standard requests directly; Next.js and SvelteKit expose route handlers; Vite and Rsbuild accept Connect-style middleware, for which the same instance provides `nodeMiddleware`. The host still decides how the live RPC connection attaches — sharing its HTTP server, receiving its upgrade events, or using a side-car — and that choice is advertised through `__connection.json`, invisible to the client. See [The Standard Handler](/adapters/initiate) for every mount pattern.

## Adapters as conveniences

Mounting the handler directly is the lowest-level option. For common entry points, [higher-level adapters](/adapters/) package the same foundation into familiar forms — a standalone CLI, a dedicated dev server, a Vite DevTools plugin, an MCP server, or a static report:

```ts
import { createPluginFromDevframe } from '@vitejs/devtools-kit/node'
import { createBuild } from 'devframe/adapters/build'
import { createCac } from 'devframe/adapters/cac'
import { createDevServer } from 'devframe/adapters/dev'
import { createMcpServer } from 'devframe/adapters/mcp'
import devframe from './devframe'

// Pick the entry points your package ships:
export const runCli = () => createCac(devframe).parse()
export const startServer = () => createDevServer(devframe)
export const vitePlugin = createPluginFromDevframe(devframe)
export const startMcp = () => createMcpServer(devframe, { transport: 'stdio' })
export const buildReport = () => createBuild(devframe, { outDir: 'dist-static' })
```

A single package can ship several of these from one definition. A build inspector could offer a standalone CLI for any project, generate static reports in CI, appear as a dock inside Vite DevTools, and let an agent query the active build — all backed by the same tool.

## Visual and agentic

Once a devtool has a structured boundary, its visual panel is no longer the only interface. The same internal state and capabilities can also be consumed programmatically. Visualizations are effective for exploration, overview, and comparison; agents can retrieve focused context, correlate it with the codebase, and carry out multi-step actions. Both read from one source of truth.

RPC functions stay private by default and explicitly opt into agent exposure. The [MCP adapter](/adapters/mcp) translates those functions, readable resources, and selected shared state into an agent-consumable surface, with descriptions, schemas, and safety metadata. See [Agent-Native](./agent-native).

## From one devframe to a hub

A single devframe is one portable tool. A complete devtools experience becomes more interesting when those tools meet and collaborate. [`@devframes/hub`](./hub) is the framework-neutral composition layer, providing shared concepts such as docks, commands, messages, and terminals. Each devframe runs against a shared context, so tools can contribute capabilities and interact with each other.

The same mounting model scales to the whole collection — [`initHub()`](./hub-initiate) puts many devframes behind one Web Standard handler:

```ts
import { createUi } from '@devframes/hub-ui'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import { createDataInspectorDevframe } from '@devframes/plugin-data-inspector'
import { createTerminalsDevframe } from '@devframes/plugin-terminals'

const hub = initHub({
  base: DEVFRAMES_HUB_BASE,
  devframes: [createDataInspectorDevframe(), createTerminalsDevframe()],
  ui: createUi(),
})

hub.handler
// the whole devtools collection as Request → Response
```

The mounted devframes share one RPC registry, state store, connection, auth gate, and optional aggregate MCP endpoint. The hub itself is headless: [`@devframes/hub-ui`](./build-your-own-hub-ui) provides a reference interface, and a product can bring its own UI without changing the underlying tools.

## Inheriting the ecosystem

Portability does not make every devtool generic. Framework-specific layers can offer richer experiences because they understand their framework's conventions and runtime — the universal parts are shared while the final integrations stay specific.

[Vite DevTools](https://devtools.vite.dev/) is the first flagship host built on this foundation, using `initHub()` for composition and serving alongside its own Vite, Rolldown, Vitest, and Oxc tooling. The [framework packages](/frameworks/) — [`@devframes/vite`](/frameworks/vite), [`@devframes/nuxt`](/frameworks/nuxt), and [`@devframes/next`](/frameworks/next) — provide nicer conventions over the same handler for authoring a single devframe or mounting a whole hub. See [Built with Devframe](/examples/built-with) for tools already using it.

## Install

```sh
pnpm add devframe
```

`devframe` ships ESM-only and has no Vite dependency. Adapters with optional peers (for example, the MCP adapter needs `@modelcontextprotocol/server`) surface the requirement at import time.

## Hello, Devframe

A minimal devframe with a CLI entry point:

```ts twoslash
import { defineDevframe, defineRpcFunction } from 'devframe'
import { createCac } from 'devframe/adapters/cac'

const devframe = defineDevframe({
  id: 'my-devframe',
  name: 'My Devframe',
  version: '1.0.0',
  packageName: 'my-devframe',
  homepage: 'https://github.com/me/my-devframe',
  description: 'A one-line summary of what the tool does.',
  icon: 'ph:gauge-duotone',
  clientAssets: 'client/dist',
  setup(ctx) {
    ctx.rpc.register(defineRpcFunction({
      name: 'my-devframe:hello',
      type: 'static',
      jsonSerializable: true,
      handler: () => ({ message: 'hello' }),
    }))
  },
})

await createCac(devframe).parse()
```

Run it:

```sh
node ./my-devframe.js        # dev server on http://localhost:9999/
node ./my-devframe.js build  # self-contained static deploy in dist-static/
node ./my-devframe.js mcp    # stdio MCP server
```

The CLI adapter serves the SPA at `/` by default. When the same devframe is embedded inside a host (`vite`, `embedded`), the default becomes `/__my-devframe/`. Override either side via `defineDevframe({ basePath })`.

## What Devframe provides

| Subsystem | What it does |
|-----------|--------------|
| **[Devframe Definition](./devframe-definition)** | One `defineDevframe` call describes your tool once; the handler and adapters deploy it anywhere. |
| **[RPC](./rpc)** | Type-safe bidirectional calls built on birpc, validated against any Standard Schema validator. Supports `query`, `static`, `action`, and `event` types. |
| **[Shared State](./shared-state)** | Observable, patch-synced state that survives reconnects and bridges server ↔ browser. |
| **[JSON-Render](./json-render)** | Opt-in data-driven UI — author a view as a serializable spec, render it standalone or in a hub dock with a replaceable frontend. |
| **[Diagnostics](./diagnostics)** | Coded warnings/errors via `nostics` — registered into the host's shared lookup so adapters and consumers share the same surface. |
| **[Streaming](./streaming)** | One-way (RPC streaming) and two-way (uploads) channel primitives for long-running data. |
| **[When Clauses](./when-clauses)** | VS Code-style conditional expressions for docks, commands, and custom UI. |
| **[The Standard Handler](/adapters/initiate)** | `initDevframe()` — the Web Standard `Request → Response` boundary every serving path is built on. |
| **[Client](./client)** | Browser-side RPC client (`connectDevframe`) with auto-auth and WebSocket / static modes. |
| **[Agent-Native](./agent-native)** | Opt-in exposure of your tool's surface to coding agents over MCP. |

## What's next

- [Devframe Definition](./devframe-definition) — understand `defineDevframe` and the `DevframeNodeContext`
- [The Standard Handler](/adapters/initiate) — mount the handler into any host
- [Adapters](/adapters/) — pick a convenience entry point for your tool
- [Hub](./hub) — compose many devframes behind one handler
