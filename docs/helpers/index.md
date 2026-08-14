---
outline: deep
---

# Helpers

Helpers are the optional, opt-in surface around the core `defineDevframe` API: small wrappers for runtime integration, prebuilt RPC recipes, and a curated set of low-level utilities. None of them are required to ship a devframe — reach for them when they match the shape of what you're building.

| Helper | Entry | What it does |
|--------|-------|--------------|
| [Utilities](./utilities) | `devframe/utils/*` | Bundled small utilities — terminal colors, hashing, editor launch, structured-clone serialization, and more. |
| [Vite Plugin](./vite-bridge) | `@devframes/vite` | Vite plugins for mounting a devframe inside any Vite-based host (Astro, SolidStart, plain Vite) — a static mount, an RPC bridge, or a convenience wrapper over both. |
| [Nuxt Module](./nuxt) | `@devframes/nuxt` | Nuxt module that wires a Nuxt SPA as a devframe client and serves the dev-time RPC bridge. |
| [Next Helper](./next) | `@devframes/next` | Route-handler host + React client for mounting devframes inside a Next.js App Router app (experimental). |
| [Common RPC Functions](./common-rpc-functions) | `devframe/recipes/common-rpc-functions` | Prebuilt RPC actions for "open in editor" and "reveal in Finder". |
| [Interactive Auth](./interactive-auth) | `devframe/recipes/interactive-auth` | Ready-made OTP auth layer — handshake, resolver gate, connect-time trust, and the code/link banner. |

Helpers vs. [adapters](/adapters/): an adapter takes a `DevframeDefinition` and deploys it as a runnable surface (CLI, dev server, static build, MCP server). A helper is a smaller piece — a Vite plugin, a Nuxt module, a recipe, a utility function — that you compose alongside an adapter.
