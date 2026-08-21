# Serve a Hub Anywhere

`initHub()` from `@devframes/hub/initiate` serves a whole multi-devframe devtools install from one web-standard handler on a catch-all route.

```ts
import { createUi } from '@devframes/hub-ui'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import { createInspectDevframe } from '@devframes/plugin-inspect'
import { createTerminalsDevframe } from '@devframes/plugin-terminals'

export const hub = initHub({
  base: DEVFRAMES_HUB_BASE, // required — the conventional `/__devframes/`
  devframes: [createInspectDevframe(), createTerminalsDevframe()],
  ui: createUi(),
  configure(ctx) {
    ctx.commands.register({ id: 'app:hello', title: 'Hello', handler: () => 'hi' })
  },
})
```

`base` is required (echoed as `hub.base`); each mounted devframe runs `setup()` against the **shared hub context**. The instance mirrors `initDevframe`'s surface — see [The Standard Handler](../adapters/initiate#mount-the-handler).

## The shared socket

One transport serves the namespace, chosen in precedence: `ws.port` pins a side-car; `server` shares the host's `node:http` upgrade at `<base>__ws`; `ws: { sidecar: true }` takes a free port; none leaves the socket to the host — Node uses `hub.attach(server)`, Bun/Deno `attachBunWsTransport` / `attachDenoWsTransport`.

The advertised path is hub-base-absolute (`/__devframes/__ws`). Dev-reevaluated hosts (Next, Nitro) memoize it on `globalThis`.

## The namespace

| Path | Serves |
| --- | --- |
| `/` | the `ui.viewer` SPA, or index document when headless |
| `<id>/` | each devframe's SPA + own `__connection.json` → shared socket |
| `embedded.js` | the `ui.embedded` bootstrap (`404` if none) |
| `__connection.json` | meta for the shared RPC socket |
| `__ws` | WebSocket upgrade route |
| `__index.json` | machine-readable index: frames, endpoints |
| `__client-imports.js` | dock client-script import map for viewers |
| `__mcp` | aggregate MCP endpoint over the tool registry (opt-in `mcp`) |

Frame ids become URL segments, validated: reserved names throw `DF8000`, non-route-safe `DF8004`.

## The `ui` slot

The hub is headless; `DevframeHubUi` is pure data:

```ts
interface DevframeHubUi {
  viewer?: { distDir: string } // a standalone SPA served at the namespace root
  embedded?: { entry: string } // a prebuilt bootstrap served at <base>embedded.js
  assets?: Record<string, () => string | Uint8Array> // extra UI-owned files
  setup?: (ctx) => void | Promise<void> // publish static config via ctx.staticConfig
}
```

`@devframes/hub-ui`'s `createUi()` is the reference (viewer + floating dock); its `setup(ctx)` publishes config to `ctx.staticConfig.ui` (`ConnectionMeta.configs.ui`):

- **`branding`** — rebrand the UI (logo, name, primary color).
- **`dockPreferences`** — dock-bar: `categoryOrder`, floating-dock `maxVisibleItems`, first-run `defaultMode` (`'float'`/`'edge'`) and `defaultPosition`.
- **`embeddedVisibility`** — the floating dock's reveal policy:
  - `'normal'` (default) — shows immediately.
  - `'passive'` — hidden until `Shift+Alt+D`, then persisted per-origin (later sessions start shown).
  - `'hidden'` — hidden until `Shift+Alt+D`, that session only.

## Renderer modules

A dock type's renderer (e.g. [JSON-Render](./json-render)) composes via `initHub({ renderers })`. Each registration `{ type, file, importName? }` (`file` = a prebuilt ES module exporting a `DockRenderer`) is served at `<base>__renderers/<type>.mjs` and published into the `devframe:dock-renderers` manifest; clients import it lazily on first mount:

```ts
import { createUi } from '@devframes/hub-ui'
import { jsonRenderUiRenderer } from '@devframes/json-render-ui/hub'

initHub({
  ui: createUi(),
  renderers: [jsonRenderUiRenderer()],
})
```

A client-registered renderer (`createDevframeClientHost({ renderers })`) overrides the manifest; an uncovered type shows the viewer's missing-renderer fallback.

Registrations are validated fail-fast: one module per type (`DF8108`), an existing bundle (`DF8109`), a route-safe type name (`DF8110`).

## One Auth for the hub

The hub's **single Auth** is one gate at the shared transport for every frame, built-ins, and the MCP route; one handshake (OTP, magic link, or pre-shared token) unlocks the namespace; `auth: false` disables it for localhost.

## Singular vs hub mounting

A devframe's SPA and RPC client are byte-identical in both cases; only the environment differs:

| What the SPA / RPC client sees | Singular (`/__git/`) | Hub (`/__devframes/git/`) |
| --- | --- | --- |
| Runtime base | `/__git/` | `/__devframes/git/` (transparent) |
| `__connection.json` | own meta, own socket | per-frame meta → shared hub socket |
| RPC registry | this frame's functions | merged: all frames + hub built-ins, cross-frame |
| Shared state | own context's slots | all frames' slots + hub slots |
| Auth | own gate, own token | the single hub Auth |
| Hub subsystems | — | docks, terminals, messages, commands; frame is also an iframe dock |
| MCP | `<base>__mcp`, this frame's tools | the hub-level aggregate |
| Isolation | hard (own context, own transport) | cooperative (shared context) |

## Bring your own context

Hosts that assemble `createHubContext` + `ctx.install` themselves pass the context instead of a `devframes` list:

```ts
const hub = initHub({ base: DEVFRAMES_HUB_BASE, context: ctx })
```

It then serves only hub-level endpoints and transport; serve each frame's meta from `hub.connectionMeta()` yourself.
