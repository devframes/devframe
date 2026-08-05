# Rsbuild Devframe Hub

A tiny, copyable **vite-devtools-style hub on Rsbuild**. [vite-devtools](https://github.com/vitejs/devtools) is the full viewer that docks many integrations behind one icon rail on top of `@devframes/hub`; this example wears the same shape — an icon dock, an iframe stage, and a drawer of hub subsystems — but hosts it from an [Rsbuild](https://rsbuild.rs) (Rspack) dev server, with a **React** browser UI.

`src/rsbuild-devframe-hub.ts` is the entire host: a small Rsbuild plugin that wires `@devframes/hub` into an Rsbuild dev server. Because `rsbuild.config.ts` runs in Node — not through Rspack — the built-in plugins are imported directly, exactly like the Vite host; none of a bundled server's dynamic-`import()` dance is needed.

## Run it

```sh
pnpm install
pnpm --filter rsbuild-devframe-hub dev
```

Open the printed URL. The dock on the left lists every mounted tool with its icon:

- **Git**, **Terminals**, **Code Server**, **RPC & State Inspector**, **A11y Inspector** — the built-in plugins, each a published `DevframeDefinition` mounted with `mountDevframe`
- **Rsbuild Demo Tool** / **Rsbuild Demo Tool B** — two trivial static SPAs that show the bare mount path

Selecting a tool loads its SPA in the stage. The bottom drawer mirrors the hub's **Commands**, **Messages**, and **Terminals** subsystems, plus a button that dispatches a command through `hub:commands:execute`.

The A11y Inspector shows a live axe-core report of this hub's own page. Rsbuild has no Vite `/@fs/`, so the host serves the plugin's in-page agent module same-origin from its own directory (`DevframeHost.mountStatic`) and attaches it as the a11y dock's `clientScript`; the hub client runtime — `createDevframeClientHost()` booted in `src/client/index.tsx` — imports it into the host page. Panel and agent share the Rsbuild origin their BroadcastChannel rides; hover a violation to ring the offending element in the hub UI.

The **RPC & State Inspector** carries an **Instances** tab that lists every devframe dev server running on your machine. The host registers itself in the shared registry (`~/.devframe/instances/`) on startup via `registerDevframeInstance()`, so it shows up as "this instance"; start another example (`pnpm --filter vite-devframe-hub dev`, or any `node bin.mjs` CLI example) in a second terminal and it appears there too, each linking to its own SPA. Its **Data** tab also exposes the live `RsbuildDevServer` and its normalized config as a data source.

## What the example proves

- `createHubContext()` boots a hub with no bundler-specific code path; a `DevframeHost` impl plugs framework specifics (static mounts, connection meta, storage, origin) in uniformly
- `mountDevframe(ctx, def)` registers any `DevframeDefinition` as a dock and serves both its SPA and its `__connection.json`, so the embedded SPA connects straight back to the hub
- Real integrations work end to end through the mount path — the inspector lists every plugin's RPC functions live, terminals stream over the hub, and code-server launches an authenticated editor
- The browser reads `devframe:docks` / `devframe:commands` shared state and dispatches commands over RPC — no hub classes imported on the client
- `createDevframeClientHost()` boots the hub's framework-level client runtime in the host page: it publishes the shared client context and imports each dock's `clientScript` (here, the a11y agent) so plugins run code in the page being inspected
- The opt-in [JSON-render](https://devframe.dev) hub integration renders through a mini **React** registry **shared verbatim with the Next hub example** — a React host rendering a server-authored spec with its own components (the "registry replacement" path) instead of the Vue reference frontend

## Build your own

The dock UI is React in `src/client/`. To skin your own viewer, read the same shared-state keys and render them however you like. The host file is the part worth copying verbatim.

## Files

| File | Role |
|---|---|
| `src/rsbuild-devframe-hub.ts` | The Rsbuild host — hub context, static + connection-meta mounts, side-car WS, instance-registry registration |
| `rsbuild.config.ts` | Mounts the built-in plugins via the host's `devframes` option; serves + attaches the a11y agent as its dock's `clientScript`; registers the JSON-render and tabbed-tool docks |
| `src/client/index.tsx` | Boots the React app and the hub client runtime |
| `src/client/Page.tsx` | The React UI that consumes the hub protocol |
| `src/client/icons.ts` | Offline Phosphor icons for the dock |
