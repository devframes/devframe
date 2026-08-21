---
navigation: false
title: 'Build a devtool once. Mount it anywhere.'
description: 'Devframe is a framework-neutral foundation for devtools. One definition becomes a Web Standard handler you can mount into any host, ship as a CLI or static report, and expose to coding agents.'
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

// one Request → Response handler, any host
const { handler } = initDevframe(myDevframe, {
  base: '/__my-tool/',
})
```

#title
Build a devtool once. Mount it anywhere.

#description
A framework-neutral foundation for devtools. One definition becomes a Web Standard handler you can mount into any host, ship as a CLI or static report, and expose to coding agents.

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
  to: /guide#why-it-exists
  color: neutral
  variant: subtle
  size: lg
  ---
  Why Devframe
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

::landing-features
#headline
Foundation

#title
One definition, every entry point

#description
`defineDevframe()` describes a tool once. `initDevframe()` turns it into a Web Standard `Request → Response` handler — and adapters reshape that same definition into whatever your package ships.

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
  Expose the same internal state to a web UI and to coding agents over MCP — one source of truth, two interfaces.
  :::

  :::landing-feature-card{icon="i-lucide-layout-dashboard" to="/guide/hub"}
  #title
  From One Devframe to a Hub

  #description
  `@devframes/hub` composes many devframes behind one handler with docks, commands, terminals, and messages.
  :::

  :::landing-feature-card{icon="i-lucide-palette" to="/plugins"}
  #title
  Built-in Plugins, Any Framework

  #description
  Official plugins span Vue, Svelte, Solid, and React — devframe owns the protocol and leaves the UI framework to the author.
  :::
::

::landing-cta
---
links:
  - label: Get started
    to: /guide
    trailingIcon: i-lucide-arrow-right
    size: lg
  - label: Browse the plugins
    to: /plugins
    color: neutral
    variant: subtle
    size: lg
---
#title
Ship your devtool everywhere

#description
Start from one `DevframeDefinition` and pick the entry points your package ships — hosted, standalone, embedded, or agentic.
::
