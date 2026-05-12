---
outline: deep
---

# Helpers

Helpers are the optional, opt-in surface around the core `defineDevframe` API: small wrappers for runtime integration, prebuilt RPC recipes, and a curated set of low-level utilities. None of them are required to ship a devframe — reach for them when they match the shape of what you're building.

| Helper | Entry | What it does |
|--------|-------|--------------|
| [Utilities](./utilities) | `devframe/utils/*` | Bundled small utilities — terminal colors, hashing, editor launch, structured-clone serialization, and more. |
| [Vite Bridge](./vite-bridge) | `devframe/helpers/vite` | Vite plugin for mounting a devframe inside any Vite-based host (Astro, SolidStart, plain Vite). |
| [Nuxt Module](./nuxt) | `@devframes/nuxt` | Nuxt module that wires a Nuxt SPA as a devframe client and serves the dev-time RPC bridge. |
| [Open Helpers](./open-helpers) | `devframe/recipes/open-helpers` | Prebuilt RPC actions for "open in editor" and "reveal in Finder". |

Helpers vs. [adapters](/adapters/): an adapter takes a `DevframeDefinition` and deploys it as a runnable surface (CLI, dev server, static build, MCP server). A helper is a smaller piece — a Vite plugin, a Nuxt module, a recipe, a utility function — that you compose alongside an adapter.
