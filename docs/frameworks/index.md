---
outline: deep
---

# Frameworks

The framework packages — [`@devframes/vite`](./vite), [`@devframes/nuxt`](./nuxt), and [`@devframes/next`](./next) — integrate devframe with a specific meta-framework's dev server. Each one splits into **two clearly-scoped subpaths**, because you're always doing one of two distinct jobs:

| Scope | Subpath | You are… |
|-------|---------|----------|
| **single** | `.../single` | building & dev-serving a **single devframe's SPA** with that tool |
| **hub** | `.../hub` | mounting a whole **[devframes-hub](/guide/hub)** (many integrations) inside that tool |

The bare package root (`@devframes/vite`, `@devframes/nuxt`, `@devframes/next`) has no export — it throws with a pointer to the two subpaths, so an accidental bare import fails loudly instead of resolving to nothing.

| Package | single | hub |
|---------|--------|-----|
| [`@devframes/vite`](./vite) | `devframeVitePlugin` / `devframeViteBridge` / `devframeVite` | `viteDevframeHub` (+ `/hub/client`) |
| [`@devframes/nuxt`](./nuxt) | the Nuxt module (`modules: ['@devframes/nuxt/single']`) | the hub Nuxt module (+ `/hub/client`) |
| [`@devframes/next`](./next) | `withDevframe` + `createDevframeNextHandler` (+ `/single/client`) | `nextDevframeHub` (+ `/hub/client`) |

## single: author one devframe

The `single` scope is for when the thing you're building **is** a devframe — you author its UI with Vite/Nuxt/Next and want its RPC backend running during development. See each package's page for the details; for the framework-neutral CLI/build/embedded outputs, reach for the [adapters](/adapters/) instead.

## hub: mount a devframes-hub

The `hub` scope mounts an [`@devframes/hub`](/guide/hub) — many integrations under one namespace, one merged RPC registry — inside the tool's dev server. Each `hub` entry wraps [`initHub`](/guide/hub-initiate), defaults the UI slot to [`@devframes/hub-ui`](/guide/build-your-own-hub-ui)'s `createUi()` (override with `ui`, or `ui: false` for a headless hub you drive with the matching `/hub/client` helper), and mounts everything behind one catch-all.

- **[Vite](./vite#mounting-a-hub)** — `viteDevframeHub()` shares Vite's dev server and injects the floating dock.
- **[Nuxt](./nuxt#mounting-a-hub)** — the hub Nuxt module wires the Vite hub plugin into `nuxt dev`.
- **[Next](./next#mounting-a-hub)** — `nextDevframeHub()` serves the hub from one App Router route on a side-car socket.

Vite and Nuxt already have native hub viewers ([Vite DevTools](https://devtools.vite.dev), [Nuxt DevTools](https://devtools.nuxt.com)) that integrate the same hub protocol, so `@devframes/vite/hub` and `@devframes/nuxt/hub` print a one-time recommendation to prefer those (silence with `{ quiet: true }`). Next has no native counterpart, so `@devframes/next/hub` stays quiet.
