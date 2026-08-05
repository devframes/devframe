---
outline: deep
---

# rsbuild-devframe-hub

The same hub protocol as the [Vite host](./vite-devframe-hub), hosted from an **Rsbuild** (Rspack) dev server with a **React** browser UI. It wires [`@devframes/hub`](/guide/hub) through a small Rsbuild plugin that registers connect middleware and starts a side-car RPC / WebSocket server — proof that the hub is host-runtime-agnostic.

Package: `rsbuild-devframe-hub` · framework: **React (Rsbuild)**

## What it proves

- `createHubContext()` boots a hub without any bundler-specific code path.
- A `DevframeHost` implementation plugs framework specifics (static mounts, connection meta, storage, origin resolution) into the hub uniformly.
- Because `rsbuild.config.ts` runs in Node — not through Rspack — the built-in plugins are imported directly, exactly like the Vite host; no bundler-ignored dynamic `import()` is needed.
- `mountDevframe(ctx, def)` registers any `DevframeDefinition` as a dock, serving both its SPA and its `__connection.json`.
- The built-in `hub:commands:execute` RPC dispatches any registered server command, regardless of how the host was constructed.
- The browser-side `connectDevframe({ baseURL: '/__hub/' })` discovers the WS endpoint via the plugin's `/__hub/__connection.json` middleware.
- The [JSON-render](/guide/json-render) hub integration with **registry replacement**: the host authors a view and projects it onto a `json-render` dock, and the React client renders it with the mini React registry **shared with the [Next host](./next-devframe-hub)** (rather than the Vue `@devframes/json-render-ui`).
- [Client-only docks](/guide/client-context#client-only-docks) the page registers itself with `context.docks.register()`: an iframe dock rendered from a Blob URL, and an interactive `json-render` dock whose spec is authored in the browser and carried inline in the dock entry (`view: { spec }`) — rendered by the same React registry as the server-authored view.

## Run it

```sh
pnpm install
pnpm --filter rsbuild-devframe-hub dev
```

Open the printed URL to see the docks, commands, messages, and terminals lists, plus a button that dispatches a sample command through `hub:commands:execute`.

## Source

[`examples/rsbuild-devframe-hub`](https://github.com/devframes/devframe/tree/main/examples/rsbuild-devframe-hub)
