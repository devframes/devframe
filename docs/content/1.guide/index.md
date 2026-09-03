---
title: 'Introduction'
navigation:
  icon: i-lucide-book-open
description: 'Devframe is a framework-neutral foundation for building a devtool once and running it everywhere - inside any host framework, as a standalone tool, or through a coding agent.'
---

**Devframe is a framework-neutral foundation for building a devtool once and running it everywhere - inside any host framework, as a standalone tool, or through a coding agent.** A devtool here is anything that makes a program's implicit state visible and interactive: an inspector, a build or bundle analyzer, an asset viewer, a state or data explorer, a terminal. You describe such a tool one time, and the same definition mounts almost anywhere. Think of it as [`unplugin`](https://unplugin.unjs.io/) for devtools.

## Why it exists

Most devtools rebuild the same plumbing (node–browser communication, state synchronization, serialization, static-asset hosting, a web interface) and wire it to one framework's dev server. The same idea then gets rebuilt, slightly differently, for the next framework, so effort fragments across the ecosystem instead of compounding.

Devframe moves that boundary. A capability is defined once against a stable interface and runs on every supported host framework, so a good tool can be built once, travel further, and improve through the work of more communities.

## Who it's for

- **Devtool authors** who want one tool to run standalone, embed in a host framework, ship as a CLI or static report, and answer to a coding agent, without maintaining a separate version per environment.
- **Framework and build-tool teams** who want to offer devtools without rebuilding shared infrastructure, and to inherit capabilities other communities already built.
- **Anyone** who wants a tool's state and actions available to both a human UI and a coding agent from one source of truth.

With a coding agent to scaffold the boilerplate, Devframe is also a fast foundation for standing up a bespoke, specific-need, or even one-off devtool.

New here? [Answer a few questions about your devtool](/guide/getting-started) and get a reading list tailored to it.

## One definition, one standard handler

Every devframe starts with [`defineDevframe()`](/guide/devframe-definition), pairing a tool's identity with its capabilities.

```ts
import { defineDevframe } from 'devframe'
import { inspectProject } from './rpc'

export default defineDevframe({
  id: 'my-tool',
  name: 'My Tool',
  /** package metadata and client entry omitted… */
  setup(ctx) {
    ctx.scope('my-tool').rpc.register(inspectProject)
  },
})
```

[`initDevframe()`](/adapters/initiate) turns the definition into a live instance whose `handler` is a Web Standard `(request: Request) => Promise<Response>`:

```ts
import { initDevframe } from 'devframe/initiate'
import devframe from './devframe'

const devtools = initDevframe(devframe, { base: '/__my-tool/' })

devtools.handler
// (request: Request) => Promise<Response>

devtools.nodeMiddleware
// (req, res, next) => void, for Connect-style servers (Vite, Rsbuild)
```

The handler serves the web interface, connection metadata, live RPC, authentication, and optional MCP endpoint under one namespace. Hono and Nitro take Web Standard requests directly; Next.js and SvelteKit expose route handlers; Vite and Rsbuild accept its `nodeMiddleware`. The live RPC connection attaches via a shared HTTP server, upgrade events, or a side-car server, advertised through `__connection.json`. See [The Standard Handler](/adapters/initiate).

## Adapters as conveniences

[Higher-level adapters](/adapters) package the foundation as a standalone CLI, dev server, Vite DevTools plugin, MCP server, or static report:

```ts
import { createPluginFromDevframe } from '@vitejs/devtools-kit/node'
import { createBuild } from 'devframe/adapters/build'
import { createCac } from 'devframe/adapters/cac'
import { createDevServer } from 'devframe/adapters/dev'
import { createMcpServer } from 'devframe/adapters/mcp'
import devframe from './devframe'

/** Pick the entry points your package ships: */
export const runCli = () => createCac(devframe).parse()
export const startServer = () => createDevServer(devframe)
export const vitePlugin = createPluginFromDevframe(devframe)
export const startMcp = () => createMcpServer(devframe, { transport: 'stdio' })
export const buildReport = () => createBuild(devframe, { outDir: 'dist-static' })
```

## Visual and agentic

One source of truth feeds a visual panel and programmatic consumers. RPC functions stay private by default and opt into agent exposure explicitly: the [MCP adapter](/adapters/mcp) translates functions, readable resources, and selected shared state into an agent-consumable interface. See [Agent-Native](/guide/agent-native).

## From one devframe to a hub

[`@devframes/hub`](/guide/hub) is the composition layer, providing shared concepts (docks, commands, messages, terminals) against a shared context. [`initHub()`](/guide/hub-initiate) puts many devframes behind one Web Standard handler:

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

The mounted devframes share one RPC registry, state store, connection, auth gate, and optional aggregate MCP endpoint. The hub is headless: [`@devframes/hub-ui`](/guide/build-your-own-hub-ui) is a reference hub UI provider a product can replace.

## Inheriting the ecosystem

[Vite DevTools](https://devtools.vite.dev/) is the first flagship hub UI provider, using `initHub()` alongside its own Vite, Rolldown, Vitest, and Oxc tooling. The [framework kits](/frameworks) ([`@devframes/vite`](/frameworks/vite), [`@devframes/nuxt`](/frameworks/nuxt), [`@devframes/next`](/frameworks/next)) add conventions over the same handler. See [Built with Devframe](/guide/built-with).

## Install

```sh
pnpm add devframe
```

`devframe` ships ESM-only, no Vite dependency. The CLI adapter's optional peer (`cac`) surfaces its requirement at import time.

## Hello, Devframe

A minimal devframe with a CLI entry point:

```ts
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

The CLI adapter serves the SPA at `/`; embedded in a host framework (`vite`, `embedded`) the default becomes `/__my-devframe/`. Override via `defineDevframe({ basePath })`.

## What Devframe provides

| Subsystem | What it does |
|-----------|--------------|
| **[Devframe Definition](/guide/devframe-definition)** | One `defineDevframe` call describes your tool; adapters deploy it anywhere. |
| **[RPC](/guide/rpc)** | Type-safe bidirectional calls on birpc, validated against any Standard Schema validator. `query`, `static`, `action`, `event` types. |
| **[Shared State](/guide/shared-state)** | Observable, patch-synced state surviving reconnects, node side ↔ browser side. |
| **[JSON-Render](/guide/json-render)** | Opt-in data-driven UI: a serializable view spec, rendered standalone or in a hub dock. |
| **[Diagnostics](/guide/diagnostics)** | Coded warnings/errors via `nostics`, in the host framework's shared lookup. |
| **[Streaming](/guide/streaming)** | One-way (RPC streaming) and two-way (uploads) channel primitives. |
| **[When Clauses](/references/when-clauses)** | VS Code-style conditional expressions for docks, commands, and custom UI. |
| **[The Standard Handler](/adapters/initiate)** | `initDevframe()`: the Web Standard `Request → Response` boundary. |
| **[Client](/guide/client)** | Browser RPC client (`connectDevframe`), auto-auth, WebSocket / static modes. |
| **[Agent-Native](/guide/agent-native)** | Opt-in exposure of your tool's capabilities to coding agents over MCP. |

## What's next

- [Tutorial: Build a Server Data Inspector](/guide/tutorial-server-data-inspector): go from an empty folder to a shippable devtool, one capability at a time
- [Devframe Definition](/guide/devframe-definition): `defineDevframe` and `DevframeNodeContext`
- [The Standard Handler](/adapters/initiate): mount into any host framework
- [Adapters](/adapters): convenience entry points
- [Hub](/guide/hub): compose many devframes
