---
layout: home

hero:
  name: Devframe
  text: Build a devtool once. Mount it anywhere.
  tagline: A framework-neutral foundation for devtools. One definition becomes a Web Standard handler you can mount into any host, ship as a CLI or static report, and expose to coding agents.
  image:
    src: /logo.svg
    alt: Devframe
    width: 240
  actions:
    - theme: brand
      text: Get Started
      link: /guide/
    - theme: alt
      text: Why Devframe
      link: /guide/#why-it-exists
    - theme: alt
      text: View on GitHub
      link: https://github.com/devframes/devframe

features:
  - icon: 🧩
    title: One Definition, One Standard Handler
    details: '`defineDevframe()` describes a tool once; `initDevframe()` turns it into a `Request → Response` handler you mount into Hono, Nitro, Next.js, SvelteKit, Vite, Rsbuild, Deno, or Bun.'
    link: /adapters/initiate
  - icon: 🔌
    title: Adapters as Conveniences
    details: The same definition also becomes a standalone CLI, a dev server, a static report, an MCP server, or a Vite DevTools dock — pick the entry points your package ships.
    link: /adapters/
  - icon: 🔁
    title: Type-safe RPC & Shared State
    details: Bidirectional calls built on birpc, validated against any Standard Schema validator, plus observable patch-synced state that survives reconnects and bridges server and browser.
    link: /guide/rpc
  - icon: 🤖
    title: Visual and Agentic
    details: Expose the same internal state and capabilities to a web UI and to coding agents over MCP — one source of truth, two interfaces, each playing to its strengths.
    link: /guide/agent-native
  - icon: 🗂️
    title: From One Devframe to a Hub
    details: '`@devframes/hub` composes many devframes behind one handler with docks, commands, terminals, and messages — the composition layer flagship hosts like Vite DevTools build on.'
    link: /guide/hub
  - icon: 🎨
    title: Built-in Plugins, Any Framework
    details: Official plugins span Vue, Svelte, Solid, and React — living proof that devframe owns the protocol and leaves the UI framework choice entirely to the author.
    link: /plugins/
---
