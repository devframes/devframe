# Vite Devframe Hub

A tiny, copyable **vite-devtools-style hub**. [vite-devtools](https://github.com/vitejs/devtools) is the full hub UI provider that docks many Vite tools behind one icon rail on top of `@devframes/hub`; this example is the smallest thing shaped like it - an icon dock, an iframe stage, and a drawer of hub subsystems - so you can see the whole protocol and build your own hub UI provider from it.

`src/vite-devframe-hub.ts` is the entire host-framework integration: a small Vite plugin around one `initHub()` call (from `@devframes/hub/initiate`). The instance mounts every devframe under one namespace - `/__devframes/<id>/` - merges their RPC registries onto one WebSocket that upgrades on Vite's own dev server at `/__devframes/__ws`, and serves the discovery endpoints (`/__devframes/__connection.json`, `__index.json`, `__client-imports.js`) - all behind one connect-style middleware that self-filters by the base and hands everything else back to Vite. Mounting a hub in any host framework follows the same shape.

## Run it

```sh
pnpm install
pnpm --filter hub-vite dev
```

On first load the hub asks you to authorize. `initHub()` gates every connection by default (devframe's interactive OTP), so it prints a 6-digit code and a magic link in the terminal, and the page shows an authorization view that exchanges the code for a bearer token stored in the browser. The hub UI provider opts out of devframe's native `prompt()` (`simpleAuth: false`) to render that view; open the magic link instead to authorize without typing. Each embedded SPA then inherits the token the host page stored.

Open the printed URL. The dock rail on the left lists every mounted tool with its icon:

- **Git**, **Terminals**, **Code Server**, **RPC & State Inspector**, **A11y Inspector** - the built-in devframes, each a published `DevframeDefinition` passed to the hub's `devframes` option
- **Demo Tool** - a trivial static SPA that shows the bare mount path

Selecting a tool loads its SPA in the stage. The bottom drawer mirrors the hub's **Commands**, **Messages**, and **Terminals** subsystems, plus a button that dispatches a command through `hub:commands:execute`, and a **Transport** section showing which RPC transport the connection runs on (`websocket` or `sse`) with a segmented Auto / WS / SSE toggle - the choice rides a `?transport=` URL param and reconnects the whole client runtime on the pinned transport.

The A11y Inspector shows a live axe-core report of this hub's own page. The devframe declares its own page script as the a11y dock's `clientScript`, so the hub serves it same-origin and the hub client runtime - `createDevframeClientRuntime()` booted in `src/client/main.ts` - imports it into the host page automatically (no wiring in `vite.config.ts`). Panel and page script share the Vite origin and tab their in-page channel handshakes across; hover a violation to ring the offending element in the hub UI.

The **RPC & State Inspector** carries an **Instances** tab that lists every devframe dev server running on your machine. The hub registers itself in the shared registry (`~/.devframe/instances/`) on startup via `registerDevframeInstance()`, so it shows up as "this instance"; start another example (`pnpm --filter a11y-messages-playground dev`, or any `node bin.mjs` CLI example) in a second terminal and it appears there too, each linking to its own SPA.

## What the example proves

- `initHub()` boots a hub with no Vite-specific code path: `server.middlewares.use(instance.nodeMiddleware)` plus Vite's `httpServer` for the shared WebSocket upgrade is the entire host-framework integration
- Every `devframes` entry is served at `/__devframes/<id>/` with its own `__connection.json`, so each embedded SPA connects straight back to the hub; `/__devframes/__index.json` lists the mounted devframes and endpoints for any external viewer
- One authorization covers the whole hub: `initHub()` gates the shared transport by default, so a single OTP handshake trusts every mounted devframe, the discovery endpoints, and the built-ins. The hub UI provider drives its own authorization view (`simpleAuth: false`) and each embedded SPA inherits the stored token
- Real devframes work end to end through the mount path - the inspector lists every mounted devframe's RPC functions live, terminals stream over the hub, and code-server launches an authenticated editor
- The browser reads `devframe:docks` / `devframe:commands` shared state and dispatches commands over RPC - no hub classes imported on the client
- `createDevframeClientRuntime()` boots the hub's framework-level client runtime in the host page: it publishes the shared client context and imports each dock's `clientScript` (here, the a11y page script) so devframes run page scripts in the user app's page
- The **JSON Render** dock is rendered by a prebuilt module this page never compiles in: the node side passes `renderers: [jsonRenderUiRenderer()]` to `initHub()`, the hub serves the module at `/__devframes/__renderers/json-render.mjs` and publishes it in the renderer manifest, and the client's renderer registry imports it lazily on first mount. (The sibling `hub-next` witness registers a local React renderer for the same type instead, which takes precedence over the manifest - the other side of the swap seam.)
- The **No Renderer** dock witnesses the missing-renderer path: its type is covered by nothing, so `renderers.mount()` resolves `{ status: 'missing-renderer' }` and the hub UI provider shows *No renderer for "demo-unrendered" in the current environment* instead of a dead panel
- The **Client Script Demo** dock witnesses **bare-specifier client scripts**: its `action.importFrom` is the npm package name `demo-dock-client`, resolved through the Vite host's advertised `clientModuleResolution` template (`'/@id/{specifier}'`, the `@devframes/vite/hub` default) - the script and its own bare `nanoevents` import load through Vite's module graph, shared with this very page. The sibling `hub-next` host has no such runtime capability, so it consumes the **same package** as a prebuilt self-contained bundle served by URL - the two shapes of `importFrom` side by side

## Build your own

The dock UI is plain DOM in `src/client/`. To skin your own hub UI provider, read the same shared-state keys and render them however you like; swap the inline `icons.ts` for your framework's icon component (UnoCSS `preset-icons`, `@iconify/vue`, …). The node-side file is the part worth copying verbatim.

## Files

| File | Role |
|---|---|
| `src/vite-devframe-hub.ts` | The Vite host - one `initHub()` call mounted as connect middleware, plus instance-registry registration |
| `vite.config.ts` | Passes the built-in and demo devframes to the hub's `devframes` option (the a11y page script rides along automatically as its dock's declared `clientScript`); composes the json-render frontend via `renderers` |
| `src/unrendered-dock.ts` | A dock type registered with no renderer on purpose - the missing-renderer fallback witness |
| `../demo-dock-client/` | The shared demo client script, consumed here via bare specifier (`action: { importFrom: 'demo-dock-client' }`) |
| `src/client/main.ts` | The browser UI that consumes the hub protocol, including the interactive-OTP authorization view |
| `src/client/icons.ts` | Offline Phosphor icons for the dock |
| `index.html` | The host page |
