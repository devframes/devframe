# Vite Devframe Hub

A tiny, copyable **vite-devtools-style hub**. [vite-devtools](https://github.com/vitejs/devtools) is the full viewer that docks many Vite integrations behind one icon rail on top of `@devframes/hub`; this example is the smallest thing shaped like it - an icon dock, an iframe stage, and a drawer of hub subsystems - so you can see the whole protocol and build your own viewer from it.

`src/vite-devframe-hub.ts` is the entire host: a small Vite plugin around one `initHub()` call (from `@devframes/hub/initiate`). The instance mounts every devframe under one namespace - `/__devframes/<id>/` - merges their RPC registries onto one WebSocket that upgrades on Vite's own dev server at `/__devframes/__ws`, and serves the discovery endpoints (`/__devframes/__connection.json`, `__index.json`, `__client-imports.js`) - all behind one connect-style middleware that self-filters by the base and hands everything else back to Vite. Every framework's hub host follows the same shape.

## Run it

```sh
pnpm install
pnpm --filter hub-vite dev
```

On first load the hub asks you to authorize. `initHub()` gates every connection by default (devframe's interactive OTP), so it prints a 6-digit code and a magic link in the terminal, and the page shows an authorization view that exchanges the code for a bearer token stored in the browser. The client shell opts out of devframe's native `prompt()` (`simpleAuth: false`) to render that view; open the magic link instead to authorize without typing. Each embedded SPA then inherits the token the host page stored.

Open the printed URL. The dock on the left lists every mounted tool with its icon:

- **Git**, **Terminals**, **Code Server**, **RPC & State Inspector**, **A11y Inspector** - the built-in plugins, each a published `DevframeDefinition` passed to the host's `devframes` option
- **Demo Tool** - a trivial static SPA that shows the bare mount path

Selecting a tool loads its SPA in the stage. The bottom drawer mirrors the hub's **Commands**, **Messages**, and **Terminals** subsystems, plus a button that dispatches a command through `hub:commands:execute`, and a **Transport** section showing which RPC transport the connection runs on (`websocket` or `sse`) with a segmented Auto / WS / SSE toggle - the choice rides a `?transport=` URL param and reconnects the whole client host on the pinned transport.

The A11y Inspector shows a live axe-core report of this hub's own page. `vite.config.ts` attaches the plugin's in-page agent as the a11y dock's `clientScript` (served via `/@fs/`), and the hub client runtime - `createDevframeClientHost()` booted in `src/client/main.ts` - imports it into the host page. Panel and agent share the Vite origin their BroadcastChannel rides; hover a violation to ring the offending element in the hub UI.

The **RPC & State Inspector** carries an **Instances** tab that lists every devframe dev server running on your machine. The host registers itself in the shared registry (`~/.devframe/instances/`) on startup via `registerDevframeInstance()`, so it shows up as "this instance"; start another example (`pnpm --filter a11y-messages-playground dev`, or any `node bin.mjs` CLI example) in a second terminal and it appears there too, each linking to its own SPA.

## What the example proves

- `initHub()` boots a hub with no Vite-specific code path: `server.middlewares.use(instance.nodeMiddleware)` plus Vite's `httpServer` for the shared WebSocket upgrade is the entire framework adapter
- Every `devframes` entry is served at `/__devframes/<id>/` with its own `__connection.json`, so each embedded SPA connects straight back to the hub; `/__devframes/__index.json` lists the mounted frames and endpoints for any external viewer
- One authorization covers the whole hub: `initHub()` gates the shared transport by default, so a single OTP handshake trusts every mounted frame, the discovery endpoints, and the built-ins. The shell drives its own authorization view (`simpleAuth: false`) and each embedded SPA inherits the stored token
- Real integrations work end to end through the mount path - the inspector lists every plugin's RPC functions live, terminals stream over the hub, and code-server launches an authenticated editor
- The browser reads `devframe:docks` / `devframe:commands` shared state and dispatches commands over RPC - no hub classes imported on the client
- `createDevframeClientHost()` boots the hub's framework-level client runtime in the host page: it publishes the shared client context and imports each dock's `clientScript` (here, the a11y agent) so plugins run code in the page being inspected
- The **JSON Render** dock is rendered by a prebuilt module this page never compiles in: the host passes `renderers: [jsonRenderUiRenderer()]` to `initHub()`, the hub serves the module at `/__devframes/__renderers/json-render.mjs` and publishes it in the renderer manifest, and the client's renderer registry imports it lazily on first mount. (The sibling `hub-next` witness registers a local React renderer for the same type instead, which takes precedence over the manifest - the other side of the swap seam.)
- The **No Renderer** dock witnesses the missing-renderer path: its type is covered by nothing, so `renderers.mount()` resolves `{ status: 'missing-renderer' }` and the shell shows *No renderer for "demo-unrendered" in the current environment* instead of a dead panel

## Build your own

The dock UI is plain DOM in `src/client/`. To skin your own viewer, read the same shared-state keys and render them however you like; swap the inline `icons.ts` for your framework's icon component (UnoCSS `preset-icons`, `@iconify/vue`, …). The host file is the part worth copying verbatim.

## Files

| File | Role |
|---|---|
| `src/vite-devframe-hub.ts` | The Vite host - one `initHub()` call mounted as connect middleware, plus instance-registry registration |
| `vite.config.ts` | Passes the built-in plugins and demo devframes to the host's `devframes` option; attaches the a11y agent as its dock's `clientScript`; composes the json-render frontend via `renderers` |
| `src/unrendered-dock.ts` | A dock type registered with no renderer on purpose - the missing-renderer fallback witness |
| `src/client/main.ts` | The browser UI that consumes the hub protocol, including the interactive-OTP authorization view |
| `src/client/icons.ts` | Offline Phosphor icons for the dock |
| `index.html` | The UI shell |
