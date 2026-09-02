---
title: 'Frameworks'
navigation:
  icon: i-lucide-layers
description: 'The framework kits - @devframes/vite, @devframes/nuxt, @devframes/next - integrate devframe with a meta-framework''s dev server. Two subpaths:'
---

The framework kits - [`@devframes/vite`](/frameworks/vite), [`@devframes/nuxt`](/frameworks/nuxt), [`@devframes/next`](/frameworks/next) - integrate devframe with a meta-framework's dev server. Two **subpaths**:

| Scope | Subpath | You are… |
|-------|---------|----------|
| **single** | `.../single` | building & dev-serving a **single devframe's SPA** with that tool |
| **hub** | `.../hub` | mounting a whole **[hub](/guide/hub)** (many devframes) inside that tool |

The bare package root throws, pointing to the two subpaths.

| Package | single | hub |
|---------|--------|-----|
| [`@devframes/vite`](/frameworks/vite) | `devframeVitePlugin` / `devframeViteBridge` / `devframeVite` | `viteDevframeHub` (+ `/hub/client`) |
| [`@devframes/nuxt`](/frameworks/nuxt) | the Nuxt module (`modules: ['@devframes/nuxt/single']`) | the hub Nuxt module (+ `/hub/client`) |
| [`@devframes/next`](/frameworks/next) | `withDevframe` + `createDevframeNextHandler` (+ `/single/client`) | `nextDevframeHub` (+ `/hub/client`) |

## single: author one devframe

For framework-neutral CLI/build/embedded outputs, use the [adapters](/adapters) instead.

## hub: mount a hub

Each `hub` scope wraps [`initHub`](/guide/hub-initiate) and defaults the UI to [`@devframes/hub-ui`](/guide/build-your-own-hub-ui)'s `createUi()` (`ui` to override, `ui: false` for headless). Per tool: **[Vite](/frameworks/vite#mounting-a-hub)**, **[Nuxt](/frameworks/nuxt#mounting-a-hub)**, **[Next](/frameworks/next#mounting-a-hub)**.

`@devframes/vite/hub` and `@devframes/nuxt/hub` recommend the native hub UI providers ([Vite DevTools](https://devtools.vite.dev), [Nuxt DevTools](https://devtools.nuxt.com)) once (silence with `{ quiet: true }`). Next has none, so `@devframes/next/hub` stays quiet.
