---
layout: home

hero:
  name: Devframe
  text: Framework-neutral foundation for Devframe
  tagline: One devframe definition, adapters to different environments. Managed communication layer, agent-native.
  image:
    src: /logo.svg
    alt: Devframe
    width: 240
  actions:
    - theme: brand
      text: Get Started
      link: /guide/
    - theme: alt
      text: View on GitHub
      link: https://github.com/devframes/devframe

features:
  - icon: 🧱
    title: One Definition, Many Adapters
    details: A single `defineDevframe` call deploys to CLI, static build, SPA, Vite plugin, embedded overlay, kit host, or MCP server.
    link: /guide/devframe-definition
  - icon: 🔌
    title: Type-safe RPC
    details: Bidirectional, schema-validated calls built on birpc + valibot. Query, static, action, and event function types.
    link: /guide/rpc
  - icon: 🔄
    title: Shared State
    details: Observable, patch-synced state that survives reconnects and bridges server and browser with structured updates.
    link: /guide/shared-state
  - icon: 🌊
    title: Streaming Channels
    details: One-way RPC streams and two-way upload channels for long-running data, progress reporting, and live feeds.
    link: /guide/streaming
  - icon: 🤖
    title: Agent-Native
    details: Surface RPC functions, tools, and resources to coding agents over MCP with a single `agent` field on each function.
    link: /guide/agent-native
---
