# Serve a Hub Anywhere

`initHub()` from `@devframes/hub/initiate` puts a whole multi-devframe devtools installation behind one web-standard handler: mount it on a single catch-all route and every frame, the shared RPC socket, the single auth gate, discovery, and the optional UI are live under one namespace.

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

`base` is required so the mount path is explicit; pass the exported `DEVFRAMES_HUB_BASE` for the conventional `/__devframes/`. The instance echoes the normalized value back as `hub.base`, so route guards and middleware reference it instead of repeating the string. Every mounted devframe runs its `setup()` against the **shared hub context**: one merged RPC registry (frames can call each other's functions), one shared-state store, one WebSocket transport, one Auth. The instance mirrors `initDevframe`'s surface — `base`, `handler`, `nodeMiddleware`, `attach`, `handleUpgrade`, `ready`, `context`, `connectionMeta()`, `close()` — and the same mount snippets apply; see [the initiate adapter](../adapters/initiate#mount-the-handler).

## The shared socket

One transport serves the whole namespace, and the hub binds nothing on its own — the same four choices `initDevframe` offers, in the same precedence: `ws.port` pins a side-car, `server` shares the host's `node:http` upgrade at `<base>__ws`, `ws: { sidecar: true }` takes a free port (for Next.js, Nitro and Rsbuild hosts, whose handlers never see upgrades), and passing none of them leaves the socket to the host:

```ts
import { serve } from '@hono/node-server'

// `serve()` returns the node server; the hub takes its upgrade events.
const detach = hub.attach(serve({ fetch: app.fetch, port: 3000 }))
```

The advertised path is hub-base-absolute (`/__devframes/__ws`), so the one meta document resolves to the same socket from the hub base and from every frame base. A host whose module gets re-evaluated in dev (Next, Nitro) memoizes the instance on `globalThis`, so a reload reuses the live hub instead of leaking its transport.

## The namespace

| Path | Serves |
| --- | --- |
| `/` | the `ui.viewer` SPA — or the index document when the hub runs headless |
| `<id>/` | each mounted devframe's SPA, with its own `__connection.json` pointing at the shared socket |
| `embedded.js` | the `ui.embedded` bootstrap (`404` without one) |
| `__connection.json` | connection meta for the shared RPC socket |
| `__ws` | the WebSocket upgrade route, for a shared or host-attached server |
| `__index.json` | the machine-readable index: frames, endpoints |
| `__client-imports.js` | the dock client-script import map for external viewers |
| `__mcp` | the aggregate MCP endpoint over the whole tool registry (opt-in via `mcp`) |

Frame ids become URL segments, so they are validated: reserved names throw `DF8000`, and ids must be route-safe (`DF8004`).

## The `ui` slot

The hub is headless — `DevframeHubUi` is pure data, and whoever fills it decides what a viewer looks like:

```ts
interface DevframeHubUi {
  viewer?: { distDir: string } // a standalone SPA served at the namespace root
  embedded?: { entry: string } // a prebuilt bootstrap served at <base>embedded.js
}
```

`@devframes/hub-ui`'s `createUi()` is the reference implementation: a standalone viewer plus the floating dock — one `<script type="module" src="/__devframes/embedded.js">` tag in the host page and the dock mounts itself, always visible. A viewer product supplies a different object to the same slot and reuses all the infrastructure; visibility policy (keyboard summon, passive modes) belongs entirely to the entry's author.

## One Auth for the hub

The hub has a **single Auth**: one gate at the one shared transport covers every frame, the hub built-ins, and the MCP route. Mounted frames have no gates of their own — trust established once (OTP exchange, magic link, or a pre-shared token) unlocks the namespace. The gate is on by default; `auth: false` opts a single-user localhost setup out.

## Singular vs hub mounting

A devframe's SPA and RPC client code are byte-identical in both cases — that is devframe's portability promise. The differences are environmental:

| What the SPA / RPC client sees | Singular (`/__git/`) | Hub (`/__devframes/git/`) |
| --- | --- | --- |
| Runtime base | `/__git/` | `/__devframes/git/` (transparent to the SPA) |
| `__connection.json` | own meta, own socket | per-frame meta pointing at the shared hub socket |
| RPC registry | this frame's functions | merged: all frames + hub built-ins, callable cross-frame |
| Shared state | own context's slots | all frames' slots + hub slots |
| Auth | own gate, own token | the single hub Auth |
| Hub subsystems | — | docks, terminals, messages, commands; the frame is also an iframe dock |
| MCP | `<base>__mcp`, this frame's tools | the aggregate at hub level |
| Isolation | hard (own context, own transport) | cooperative (shared context — tools compose) |

## Bring your own context

Hosts that assemble `createHubContext` + `ctx.install` themselves (with their own `DevframeHost` serving the frames) pass the finished context instead of a `devframes` list:

```ts
const hub = initHub({ base: DEVFRAMES_HUB_BASE, context: ctx })
```

The instance then serves the hub-level endpoints and transport only; serve each frame's meta from `hub.connectionMeta()` yourself. The two reference examples — `examples/hub-vite` and `examples/hub-next` — use the declarative mode with their own hand-built viewer UIs, while the `hub-*-minimal` family (`hub-vite-minimal`, `hub-next-minimal`, `hub-nitro-minimal`, `hub-hono-minimal`, `hub-rsbuild-minimal`) shows the minimal `createUi()` mount across frameworks (the Hono one on Node and Bun).
