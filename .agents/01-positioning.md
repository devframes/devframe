# 01 - Positioning

## What each layer is

**`devframe`** is the framework-neutral container for one devtool integration, portable across hub UI providers. It packages a single tool - its RPC, its SPA, its diagnostics, its CLI/build/embedded outputs - without caring how it will be displayed. A devframe runs standalone (CLI, static deploy, embedded SPA) just as well as it mounts inside a hub.

**`@devframes/hub`** is the framework-neutral hub layer on top of devframe: multi-devframe orchestration (docks, terminals, messages, commands). It ships no UI - hub UI providers (e.g. `@vitejs/devtools-kit`) provide their own UI over the hub's RPC + shared-state protocol. It does ship a **headless client runtime** (`createDevframeClientRuntime()` from `@devframes/hub/client`): booted in the host page, it assembles the shared `DevframeClientContext` (panel, docks, commands, when) and imports each dock entry's client script (`action` / `custom-render` / iframe `clientScript`) into that page - how a built-in devframe like the a11y inspector runs its page script inside the user app's page. `examples/custom-hub-vite/` is a working ~120-line Vite host demonstrating the protocol end to end.

## Design principles

These enforce the split "devframe provides primitives, the hub provides UX". When in doubt, err toward the primitive.

- **Single-integration scope.** Devframe describes one tool. A feature that only makes sense when multiple tools share a UI - docking, a unified command palette, cross-tool toasts, terminal aggregation - MUST live in a hub package, not in `devframe`.
- **Headless by default.** Core and adapters MUST NOT ship default startup banners, opinionated stdout logging, or default styling. Provide hooks (`onReady`, `cli.configure`, …) and let the application print its own branding. Structured diagnostics via `nostics` are fine ([08](./08-diagnostics.md)); ad-hoc `console.log`s baked into adapters are not.
- **Mount path depends on adapter context.** Given `id: 'foo'`, the default mount path is `/__foo/` for *hosted* adapters (`vite`, `embedded`) and `/` for *standalone* adapters (`cli`, `build`). Authors override via `DevframeDefinition.basePath`. Adapter code that may run standalone MUST NOT hardcode a mount path.
- **SPAs own their basePath at runtime.** SPAs are built with relative asset paths (`vite.base: './'`) and discover the effective base in the browser from the executing script's location / `document.baseURI`. `createBuild` copies SPA output verbatim - no HTML rewriting, no build-time `--base` injection. The RPC client (`connectDevframe`) resolves `.connection.json` relative to the runtime base automatically.
- **CLI flags compose from both sides.** The `cac` instance backing `createCac` is exposed to the `DevframeDefinition` (`cli.configure(cli)`) for capabilities the tool contributes, and to the `createCac` caller for flags added at final assembly. Parsed flag values are forwarded to `setup(ctx, { flags })`. `createCac` itself MUST NOT hardcode domain-specific flags.
