---
navigation: false
title: 'Build a devtool once. Mount it anywhere.'
description: 'Devframe is a framework-neutral foundation for devtools. One definition becomes a Web Standard handler you can mount into any host framework, ship as a CLI or static report, and expose to coding agents.'
---

::u-page-hero
---
orientation: horizontal
---
```ts
import { defineDevframe } from 'devframe'
import { initDevframe } from 'devframe/initiate'

const myDevframe = defineDevframe({
  id: 'my-tool',
  name: 'My Tool',
  rpc: [getModules],
  view: { type: 'spa', distDir: './dist/client' },
})

// one Request → Response handler, any host framework
const { handler } = initDevframe(myDevframe, {
  base: '/__my-tool/',
})
```

#title
Build a devtool once. Mount it anywhere.

#description
A framework-neutral foundation for devtools. One definition becomes a Web Standard handler you can mount into any host framework, ship as a CLI or static report, and expose to coding agents.

#links
  :::u-button
  ---
  to: /guide
  size: lg
  trailing-icon: i-lucide-arrow-right
  ---
  Get started
  :::

  :::u-button
  ---
  icon: i-simple-icons-github
  color: neutral
  variant: ghost
  size: lg
  to: https://github.com/devframes/devframe
  target: _blank
  ---
  View on GitHub
  :::
::

<!-- 
::u-page-section
  :::callout
  ---
  icon: i-lucide-newspaper
  to: https://antfu.me/posts/pluggable-extensible-playful-devtools
  target: _blank
  class: 'max-w-3xl mx-auto mt-[-10]'
  ---
  Read the announcement, **Pluggable, Extensible, and Playful DevTools**, for the vision behind devframe.
  :::
::
-->

::landing-features
#headline
Foundation

#title
One definition, every entry point

#description
`defineDevframe()` describes a tool once. `initDevframe()` turns it into a Web Standard `Request → Response` handler, and adapters reshape that same definition into whatever your package ships.

#default
  :::landing-feature-card{icon="i-lucide-puzzle" to="/adapters/initiate"}
  #title
  One Standard Handler

  #description
  Mount the same handler into Hono, Nitro, Next.js, SvelteKit, Vite, Rsbuild, Deno, or Bun.
  :::

  :::landing-feature-card{icon="i-lucide-plug" to="/adapters"}
  #title
  Adapters as Conveniences

  #description
  The same definition also becomes a standalone CLI, a dev server, a static report, an MCP server, or a Vite DevTools dock.
  :::

  :::landing-feature-card{icon="i-lucide-repeat" to="/guide/rpc"}
  #title
  Type-safe RPC & Shared State

  #description
  Bidirectional calls built on birpc, validated against any Standard Schema validator, plus observable patch-synced state that survives reconnects.
  :::

  :::landing-feature-card{icon="i-lucide-bot" to="/guide/agent-native"}
  #title
  Visual and Agentic

  #description
  Expose the same internal state to a web UI and to coding agents over MCP: one source of truth, two interfaces.
  :::

  :::landing-feature-card{icon="i-lucide-layout-dashboard" to="/guide/hub"}
  #title
  From One Devframe to a Hub

  #description
  `@devframes/hub` composes many devframes behind one handler with docks, commands, terminals, and messages.
  :::

  :::landing-feature-card{icon="i-lucide-palette" to="/add-ons"}
  #title
  Built-in Devframes, Any Framework

  #description
  The built-in devframes span Vue, Svelte, Solid, and React: devframe owns the protocol and leaves the UI framework to the author.
  :::
::

::landing-tabs
---
items:
  - icon: i-simple-icons-hono
    title: Hono
    description: Pass the Web Standard request straight to the handler.
  - icon: i-lucide-server
    title: Nitro
    description: Mount the same handler on a catch-all event route.
  - icon: i-simple-icons-nextdotjs
    title: Next.js
    description: Wire the handler into an App Router route handler.
  - icon: i-simple-icons-vite
    title: Vite
    description: Use the connect-style middleware the same instance provides.
---

#headline
Portability

#title
The same handler, mounted natively

#description
A devframe's boundary is simply the Web Standard `Request` and `Response`. Any framework that speaks that (or connect-style middleware) mounts the same tool and inherits the whole ecosystem. Only the host-framework-facing glue changes. [See all adapters](/adapters/initiate).

#code-0
  ```ts [server.ts]
  import { Hono } from 'hono'
  import { devtools } from './devtools'

  const app = new Hono()

  app.all(`${devtools.base}*`, c => devtools.handler(c.req.raw))
  ```

#code-1
  ```ts [routes/[...devtools].ts]
  import { devtools } from '../devtools'

  export default defineEventHandler(event => devtools.handler(toWebRequest(event)))
  ```

#code-2
  ```ts [app/__my-tool/[...all]/route.ts]
  import { devtools } from '@/devtools'

  export const GET = (req: Request) => devtools.handler(req)
  export const POST = GET
  ```

#code-3
  ```ts [vite.config.ts]
  import { devtools } from './devtools'

  export default defineConfig({
    plugins: [{
      name: 'my-tool',
      configureServer: server => server.middlewares.use(devtools.nodeMiddleware),
    }],
  })
  ```
::

::landing-tabs
---
reverse: true
items:
  - icon: i-lucide-terminal
    title: CLI
    description: Ship a standalone command any project can run.
  - icon: i-lucide-server-cog
    title: Dev server
    description: A dedicated dev server for local iteration.
  - icon: i-lucide-bot
    title: MCP
    description: Expose the tool to coding agents over MCP.
  - icon: i-lucide-package
    title: Static report
    description: Build a self-contained SPA snapshot for CI.
---

#headline
Adapters

#title
Package it the way your tool ships

#description
The handler is the smallest common denominator. Higher-level adapters package that same definition into familiar forms; pick the entry points your package needs. [Browse the adapters](/adapters).

#code-0
  ```ts [cli.ts]
  import { createCac } from 'devframe/adapters/cac'
  import myDevframe from './my-tool'

  createCac(myDevframe).parse()
  ```

#code-1
  ```ts [dev.ts]
  import { createDevServer } from 'devframe/adapters/dev'
  import myDevframe from './my-tool'

  createDevServer(myDevframe)
  ```

#code-2
  ```ts [mcp.ts]
  import { createMcpServer } from 'devframe/adapters/mcp'
  import myDevframe from './my-tool'

  createMcpServer(myDevframe, { transport: 'stdio' })
  ```

#code-3
  ```ts [report.ts]
  import { createBuild } from 'devframe/adapters/build'
  import myDevframe from './my-tool'

  createBuild(myDevframe, { outDir: 'dist-static' })
  ```
::

::landing-tabs
---
items:
  - icon: i-lucide-eye
    title: Visual
    description: Explore, overview, and compare through a web UI.
  - icon: i-lucide-bot
    title: Agentic
    description: Retrieve focused context and carry out multi-step actions.
---

#headline
Interfaces

#title
One capability, two interfaces

#description
RPC functions stay private by default and opt into agent exposure explicitly. The [MCP adapter](/adapters/mcp) translates those functions, resources, and selected shared state into an agent-consumable interface: the presentation changes, the source of truth stays the same.

#code-0
  ```ts [rpc.ts]
  import { defineRpcFunction } from 'devframe'

  export const inspectBuild = defineRpcFunction({
    name: 'inspect-build',
    type: 'query',
    handler: () => readBuildGraph(),
  })
  ```

#code-1
  ```ts [rpc.ts]
  export const inspectBuild = defineRpcFunction({
    name: 'inspect-build',
    type: 'query',
    /** opt this capability into agent exposure */
    agent: { description: 'Read the current build graph and chunk sizes.' },
    handler: () => readBuildGraph(),
  })
  ```
::

::landing-tabs
---
reverse: true
items:
  - icon: i-lucide-layout-dashboard
    title: Compose
    description: Register many devframes into one hub.
  - icon: i-lucide-plug
    title: Mount
    description: Serve the whole collection behind one handler.
---

#headline
Hub

#title
From one devframe to a devtools hub

#description
When several devtools run at once, discovery becomes the problem. `@devframes/hub` is a headless composition layer: many devframes register docks, commands, terminals, and shared state, and appear through one consistent entry. [Learn about the hub](/guide/hub).

#code-0
  ```ts [hub.ts]
  import { initHub } from '@devframes/hub/initiate'
  import { createTerminalsDevframe } from '@devframes/plugin-terminals'

  const hub = initHub({
    base: '/__devframes/',
    devframes: [
      createTerminalsDevframe(),
      // ...more devframes
    ],
    ui: await import('@devframes/hub-ui').then(m => m.createUi()),
  })
  ```

#code-1
  ```ts [server.ts]
  import { Hono } from 'hono'
  import { hub } from './hub'

  // the same handler/middleware API as a standalone devframe
  new Hono().all(`${hub.base}*`, c => hub.handler(c.req.raw))
  ```
::


<!--
  - label: Read the announcement
    to: https://antfu.me/posts/pluggable-extensible-playful-devtools
    target: _blank
    color: neutral
    variant: subtle
    size: lg
    icon: i-lucide-newspaper
-->

::landing-cta
---
links:
  - label: Get started
    to: /guide
    trailingIcon: i-lucide-arrow-right
    size: lg
---
#title
Ship your devtool everywhere

#description
Start from one `DevframeDefinition` and pick the entry points your package ships: hosted, standalone, embedded, or agentic.
::

