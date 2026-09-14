# 05 - Framework kits: two scopes, one shape

The framework kits - `@devframes/vite`, `@devframes/nuxt`, `@devframes/next` - each split their surface into two clearly-scoped subpaths, because a consumer is always doing one of two distinct jobs. All three kits MUST stay parallel.

## `.../single` - author one devframe

Build & dev-serve a single devframe's SPA with that tool. Vite: the `devframeVitePlugin` / `devframeViteBridge` / `devframeVite` plugins. Next: `withDevframe` + `createDevframeNextHandler`, with its React client at `.../single/client`. Nuxt: the Nuxt module (registered as `modules: ['@devframes/nuxt/single']`).

## `.../hub` - stand up devtools

Mount a whole `@devframes/hub` (many devframes) inside that tool. Wraps `initHub`, defaults the UI slot to `@devframes/hub-ui`'s `createUi()` (overridable via `ui`, or `ui: false` for headless), and ships a browser client helper at `.../hub/client` (a thin, lifecycle-managing wrapper over `@devframes/hub/client`'s `createDevframeClientRuntime`).

`@devframes/hub` and `@devframes/hub-ui` are **optional peers** of these packages; `hub-ui` MUST be loaded lazily (a bundler-ignored dynamic `import()` in the Next hub) so it stays optional and its `import.meta.url` asset lookups resolve at request time.

## Rules

- The bare root (`.`) MUST throw a helpful error pointing at the two subpaths - real code never lives on it.
- Vite and Nuxt already have native hub UI providers (`@vitejs/devtools-kit`, `@nuxt/devtools`), so `@devframes/vite/hub` and `@devframes/nuxt/hub` still work but emit a one-time `console.warn` recommending those (silenced with `{ quiet: true }`). `@devframes/next/hub` has no native counterpart and warns nothing.

## How the examples consume the kits

The **full hub examples** (`examples/custom-hub-vite`, `examples/custom-hub-next`) consume `.../hub` on the node side but hand-roll their own hub UI provider against `@devframes/hub/client` with `ui: false` - that hand-rolled hub UI provider is the whole point of those reference hosts ([07](./07-hub-examples.md)). The **minimal** ones (`examples/hub-vite`, `examples/hub-next`, `examples/hub-deno`, `examples/hub-fastify`, `examples/hub-hono`, `examples/hub-nitro`, `examples/hub-rsbuild`, `examples/hub-sveltekit`) consume `.../hub` with the default `@devframes/hub-ui` and inject its `embedded.js`, needing no browser-side code.
