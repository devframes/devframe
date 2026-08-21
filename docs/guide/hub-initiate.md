# Serve a Hub Anywhere

`initHub()` from `@devframes/hub/initiate` puts a whole multi-devframe devtools install behind one web-standard handler: mount it on a catch-all route and every frame, the shared RPC socket, auth gate, discovery, and optional UI live under one namespace.

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

`base` is required (echoed back as `hub.base`). Each mounted devframe runs `setup()` against the **shared hub context**. The instance mirrors `initDevframe`'s surface (`base`, `handler`, `nodeMiddleware`, `attach`, `handleUpgrade`, `ready`, `context`, `connectionMeta()`, `close()`); see [The Standard Handler](../adapters/initiate#mount-the-handler).

## The shared socket

One transport serves the namespace — four choices, in precedence: `ws.port` pins a side-car; `server` shares the host's `node:http` upgrade at `<base>__ws`; `ws: { sidecar: true }` takes a free port; none leaves the socket to the host — a Node host uses `hub.attach(server)`, Bun/Deno `attachBunWsTransport` / `attachDenoWsTransport`:

```ts
import { serve } from '@hono/node-server'

// `serve()` returns the node server; the hub takes its upgrade events.
const detach = hub.attach(serve({ fetch: app.fetch, port: 3000 }))
```

The advertised path is hub-base-absolute (`/__devframes/__ws`), so one meta document resolves to the same socket from every base. Dev-reevaluated hosts (Next, Nitro) memoize the instance on `globalThis`, reusing the hub across reloads.

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

Frame ids become URL segments and are validated: reserved names throw `DF8000`; ids must be route-safe (`DF8004`).

## The `ui` slot

The hub is headless; `DevframeHubUi` is pure data — whoever fills it decides the viewer:

```ts
interface DevframeHubUi {
  viewer?: { distDir: string } // a standalone SPA served at the namespace root
  embedded?: { entry: string } // a prebuilt bootstrap served at <base>embedded.js
  assets?: Record<string, () => string | Uint8Array> // extra UI-owned files
  setup?: (ctx) => void | Promise<void> // publish static config via ctx.staticConfig
}
```

`@devframes/hub-ui`'s `createUi()` is the reference: a standalone viewer + floating dock, from one `<script type="module" src="/__devframes/embedded.js">` tag. Its `setup(ctx)` publishes config to `ctx.staticConfig.ui` (via `ConnectionMeta.configs.ui`):

- **`branding`** — rebrand the UI (logo, name, primary color).
- **`dockPreferences`** — dock-bar: `categoryOrder`, floating-dock `maxVisibleItems`, first-run `defaultMode` (`'float'`/`'edge'`) and `defaultPosition`.
- **`embeddedVisibility`** — the floating dock's reveal policy:
  - `'normal'` (default) — shows immediately.
  - `'passive'` — starts hidden (console hint); `Shift+Alt+D` reveals it, persisted per-origin so later sessions start shown.
  - `'hidden'` — starts hidden; `Shift+Alt+D` reveals it for the session only.

```ts
createUi({ embeddedVisibility: 'passive', dockPreferences: { defaultMode: 'edge' } })
```

## Renderer modules

An opt-in dock type's renderer (e.g. [JSON-Render](./json-render)) composes at the hub via `initHub({ renderers })`, which takes registrations `{ type, file, importName? }` (`file` is a prebuilt ES module exporting a `DockRenderer`), serves each at `<base>__renderers/<type>.mjs`, and publishes the **renderer manifest** into the `devframe:dock-renderers` slot. Hub-aware clients lazily import a module on first mount:

```ts
import { createUi } from '@devframes/hub-ui'
import { jsonRenderUiRenderer } from '@devframes/json-render-ui/hub'

initHub({
  ui: createUi(),
  renderers: [jsonRenderUiRenderer()],
})
```

A renderer registered in client code (`createDevframeClientHost({ renderers })`) takes precedence over the manifest; a type covered by neither renders the viewer's missing-renderer fallback. Modules are self-styling, shadow-root-safe.

Registrations are validated fail-fast: one module per type (`DF8108`), an existing bundle (`DF8109`), a route-safe type name (`DF8110`).

## One Auth for the hub

The hub has a **single Auth**: one gate at the shared transport covers every frame, built-ins, and the MCP route. Trust established once (OTP, magic link, or pre-shared token) unlocks the namespace; `auth: false` disables it for single-user localhost.

## Singular vs hub mounting

A devframe's SPA and RPC client code are byte-identical in both cases; differences are environmental:

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

It then serves only hub-level endpoints and transport; serve each frame's meta from `hub.connectionMeta()` yourself. `examples/hub-vite` and `examples/hub-next` use declarative mode with hand-built viewers; `hub-*-minimal` shows the minimal `createUi()` mount across many frameworks.
