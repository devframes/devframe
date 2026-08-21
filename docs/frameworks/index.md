---
outline: deep
---

# Frameworks

The framework packages — [`@devframes/vite`](./vite), [`@devframes/nuxt`](./nuxt), [`@devframes/next`](./next) — integrate devframe with a meta-framework's dev server. Two **subpaths**:

| Scope | Subpath | You are… |
|-------|---------|----------|
| **single** | `.../single` | building & dev-serving a **single devframe's SPA** with that tool |
| **hub** | `.../hub` | mounting a whole **[devframes-hub](/guide/hub)** (many integrations) inside that tool |

The bare package root throws, pointing to the two subpaths.

| Package | single | hub |
|---------|--------|-----|
| [`@devframes/vite`](./vite) | `devframeVitePlugin` / `devframeViteBridge` / `devframeVite` | `viteDevframeHub` (+ `/hub/client`) |
| [`@devframes/nuxt`](./nuxt) | the Nuxt module (`modules: ['@devframes/nuxt/single']`) | the hub Nuxt module (+ `/hub/client`) |
| [`@devframes/next`](./next) | `withDevframe` + `createDevframeNextHandler` (+ `/single/client`) | `nextDevframeHub` (+ `/hub/client`) |

## single: author one devframe

For framework-neutral CLI/build/embedded outputs, use the [adapters](/adapters/) instead.

## hub: mount a devframes-hub

Each `hub` entry wraps [`initHub`](/guide/hub-initiate) and defaults the UI to [`@devframes/hub-ui`](/guide/build-your-own-hub-ui)'s `createUi()` (`ui` to override, `ui: false` for headless). Per tool: **[Vite](./vite#mounting-a-hub)**, **[Nuxt](./nuxt#mounting-a-hub)**, **[Next](./next#mounting-a-hub)**.

`@devframes/vite/hub` and `@devframes/nuxt/hub` recommend the native viewers ([Vite DevTools](https://devtools.vite.dev), [Nuxt DevTools](https://devtools.nuxt.com)) once (silence with `{ quiet: true }`). Next has none, so `@devframes/next/hub` stays quiet.
