# Plan: `/__devframes/` framework-agnostic standard middleware

> Plan of record settled in a design interview on 2026-08-05. Implementation lands as a
> 5-PR GitHub stack (bottom → top), each layer passing the full gauntlet
> (`pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build`).

## Goal

One web-standard handler (`(Request) => Response`, Comark-style — see
<https://content.comark.dev/getting-started/installation#mount-the-handler>) that carries the
entire devtools surface — mounted devframes, WS RPC, auth, MCP, embedded floating mode —
mountable on any framework with a single catch-all route (Vite, Nitro, Hono, Next.js, Nuxt,
SvelteKit), running on Node ≥ 20 and Bun. The hub stays headless; UI is a composable slot.

## Architecture

### Two `createHandler` factories, one UI slot

| Import | Serves | Default base |
|---|---|---|
| `devframe/initiate` | **One devframe**: its SPA (`distDir`; omitted → bridge mode serving only meta + WS), `__connection.json`, `__mcp`, WS RPC, auth. Own isolated context, one `def.setup(ctx)`. | `/__<id>/` (hosted rule) |
| `@devframes/hub/initiate` | **Multi-frame, headless**: shared hub context (docks/terminals/messages/commands + hub built-in RPCs + shared-state slots); every frame's `setup(ctx)` runs against it → one merged RPC registry, one WS endpoint, **one hub Auth**, one aggregate MCP. Frames auto-registered as iframe docks. | `/__devframes/` |

**`DevframeHubUi` slot** (type lives in `@devframes/hub`; data-first, zero policy):

```ts
interface DevframeHubUi {
  viewer?: { distDir: string } // standalone viewer SPA served at the namespace root
  embedded?: { entry: string } // prebuilt bootstrap served at <base>embedded.js
}
```

`@devframes/hub-ui` (new package) exports `createUi(options?)` — the *reference* implementation
(a port of Vite DevTools' web components). Vite DevTools / community supply their own `ui`
object to the same slot, reusing all infra. There is **no** `createHandler` in hub-ui.

### Handler API (both factories)

```ts
const h = createHandler(defOrOptions, {
  base?,                   // mount base; hosted default /__<id>/ (core) or /__devframes/ (hub)
  server?,                 // sugar: node http server → shared WS upgrade at <base>__ws
  ws?: DevframeWsOptions,  // explicit control — url > port > route (default '__ws')
  auth?,                   // default TRUE (existing OTP/token machinery); explicit false to opt out
  mcp?,                    // per-frame MCP (core) / aggregate MCP (hub)
  key?,                    // globalThis memoization — HMR re-evaluation returns the live instance
  origin?,                 // banner origin override; else derived lazily from first request
  // hub only:
  devframes?, context?,    // declarative list OR pre-built hub context
  configure?,              // async (ctx) => {} for docks/commands/terminals/messages registration
  ui?,                     // DevframeHubUi
})
// → { fetch(request, runtimeCtx?), nodeMiddleware, websocket, ready, context,
//     connectionMeta(), close() }
```

- Sync factory, **eager** async init; `fetch` awaits `ready` internally.
- `fetch` 404s inside its base; `nodeMiddleware` (connect-style) calls `next()` outside it.
- Bun: `fetch(req, server)` second arg + exposed `websocket` hooks (crossws Bun adapter).
- `key` memoization: a re-evaluation returns the live instance (closes/replaces it if the
  options changed) — prevents eager side-car leaks under Next/Nitro/SvelteKit dev HMR.

### WebSocket resolution (precedence)

1. `ws.url` — advertise an external endpoint verbatim; the handler owns **no** transport.
   Hosts that want the handler's RPC on their *own* WS server use the documented recipe:
   `attachWsRpcTransport(handler.context RPC group, { server, path })` + a matching `ws`.
2. `ws.port` — explicit side-car port.
3. `server` — shared upgrade on the host's node http server at `<base><ws.route ?? '__ws'>`.
4. *(default)* — **eager** auto side-car on a free port, started at handler creation so
   `__connection.json` is stable from the first request.

All four advertised consistently in `__connection.json`. The WS route unifies on **`__ws`**
everywhere (breaking: was `__devframe_ws`), matching upstream Vite DevTools' `/__devtools/__ws`.

### Path layout (hub, under base `/__devframes/`)

| Path | Serves | Condition |
|---|---|---|
| `/` | `ui.viewer` dist, else the index document | — |
| `__index.json` | JSON index: frame ids/bases, endpoint paths | always |
| `embedded.js` | `ui.embedded.entry` | 404 without `ui.embedded` |
| `__connection.json` | hub connection meta | always |
| `__ws` | WS upgrade route (shared-server tier) | always |
| `__client-imports.js` | dock client-script import map | always |
| `__mcp` | **aggregate** MCP over the shared context registry | when `mcp` enabled |
| `<id>/` | each frame's SPA + its per-frame `__connection.json` | reserved-name-validated ids |

Per-frame `__mcp` exists only on the singular handler (the hub's shared context makes the
aggregate the meaningful endpoint; tool ids are already namespaced `devframes:plugin:<slug>:*`).

### Auth

- Gated **by default** on both factories (existing `createInteractiveAuth` OTP + token
  machinery; `anonymous:` pre-trust prefix; WS origin gate).
- **Hub: a single Auth.** One `DevframeAuthHandler` owned by the hub handler, one OTP
  handshake, one trusted-token store, enforced at the one shared transport. Mounted frames
  have no auth of their own — trust established once covers every frame, the aggregate MCP
  origin gate, and the hub built-ins. Iframes may arrive pre-authorized via hub-served
  `authToken` meta or reuse the parent page's connection (`__DEVFRAME_CONNECTION__`).
- Banner origin derived lazily from the first request (`origin` option overrides).

### Embedded mode

- `embedded.js` = prebuilt bundle: headless `createDevframeClientHost` + hub-ui's
  `DockEmbedded`. **Always visible on load** — no view-mode model in hub-ui. Visibility
  policy belongs to whoever authors the entry (Vite DevTools keeps its normal/passive/hidden
  model in *its own* entry via its own `embedded: { entry }`). Dock-local state
  (position/collapse) stays — component behavior, not visibility policy.
- Base discovery from `import.meta.url`; OTP/auth UI included.
- Injection = documented one-line `<script type="module" src="/__devframes/embedded.js">`
  per framework. No Vite sugar plugin in this effort (deferred).

### Singular vs hub mounting — what a devframe's SPA / RPC client sees

The devframe's SPA and RPC client code are **byte-identical** in both cases (devframe's
portability promise): relative assets, base from `document.baseURI`, `connectDevframe()`
fetching `<base>__connection.json`. The differences are environmental:

| What the SPA / RPC client sees | Singular (`/__git/`) | Hub (`/__devframes/git/`) |
|---|---|---|
| Runtime base | `/__git/` | `/__devframes/git/` (transparent to the SPA) |
| `__connection.json` | Own meta; WS at `<base>__ws` or side-car | Per-frame meta pointing at the **shared** hub WS |
| RPC registry | Only this frame's functions (+ `anonymous:` handshake) | Merged: all frames + hub built-ins — callable cross-frame by design |
| Shared state | Own context's slots only | All frames' slots + hub slots |
| Auth | Own gate, own token | **Single hub Auth** — frames delegate entirely; one handshake unlocks the namespace |
| Hub subsystems | Absent | Present; frame is also an iframe dock |
| MCP | `<base>__mcp`, this frame's tools | Aggregate only, at hub level |
| Isolation | Hard (own context, own transport) | Cooperative (shared context — tools can compose) |

### Migrations (same effort, public names kept)

- `createDevServer` → thin node server over `createHandler` (+ port resolution, instance
  registry, openBrowser). One wiring everywhere.
- `viteDevBridge` → wraps the singular handler (`nodeMiddleware` + `server.httpServer` WS).
- `@devframes/next` → reduces to memoization/re-export sugar over the handler.
- `@devframes/nuxt` externally untouched.
- Retire the unused `DEVFRAME_MOUNT_PATH` constant in favor of the new default-base constants.

## Delivery: 5-PR GitHub stack (bottom → top, merge bottom-up)

1. **`feat/handler-core`** — this plan doc; `devframe/initiate`: `createHandler` (fetch/node/Bun
   shapes, four WS resolutions, auth gate, per-frame MCP, `key` memo), `__ws` constants,
   new `DF00xx` diagnostics + `docs/errors/` pages, vitest coverage (fetch, middleware,
   WS tiers + meta correctness per resolution, auth gating).
2. **`feat/handler-adapters`** — `createDevServer` / `viteDevBridge` / `@devframes/next`
   rebuilt on the handler; api-snapshot updates.
3. **`feat/hub-handler`** — `@devframes/hub/initiate`: internal `DevframeHost` impl, frame
   mounting at `<base><id>/`, `ui` slot + `DevframeHubUi` type, `__index.json`,
   `__client-imports.js`, aggregate MCP, `devframes`/`context`/`configure` options,
   `DF8xxx` diagnostics, tests incl. reserved-path guards, cross-frame RPC visibility,
   shared-WS meta resolution from per-frame metas.
4. **`feat/hub-ui`** — new package `@devframes/hub-ui`: full web-components port from
   Vite DevTools (DockEmbedded, DockStandalone, floating, views, views-builtin,
   command-palette, message, auth UI — no mode plumbing), devframe-branded
   (`@antfu/design` tokens, Phosphor icons, named `z-*` layers), two prebuilt entries
   (vanilla standalone viewer shell, embedded bootstrap), `createUi()`, storybook per repo
   convention, typecheck/knip/exports wiring.
5. **`feat/handler-examples-docs`** — migrate both reference hub examples onto the headless
   hub handler (hand-built UIs kept as protocol demos, parity + README parity maintained);
   new minimal `examples/nitro-devframe-hub` + `examples/hono-devframe-hub`
   (`ui: createUi()` + script tag; Hono verified on Node **and** Bun); local `scripts/` Bun
   smoke test (boots the Hono example on Bun: fetch + WS RPC + embedded.js); Comark-style
   mount guides for Vite/Nitro/Hono/Next/Nuxt/SvelteKit; "Singular vs hub mounting" docs page.

## Breaking changes (pre-1.0, called out in PR bodies)

- Hosted default bases move under the hub base: `/__<id>/` → `<hubBase><id>/`
  (coordinate with vite-devtools downstream).
- WS route `__devframe_ws` → `__ws` across all adapters.

## Verification items / known risks

- Per-frame meta → shared `__ws` resolution (`resolveWsUrl`) — dedicated tests in PR 3.
- Eager side-car + HMR leaks — built-in `key` memoization; all snippets set it.
- Auth banner origin — lazy derivation from first request + `origin` override.
- hub-ui port is the bulk of the diff (~5–8k LOC) — isolated in its own PR layer.

## Non-goals

Deno/Cloudflare runtimes; per-frame MCP under the hub; `__mode.json` / view-mode machinery;
framework injection sugar (Vite plugin deferred); any UI inside `@devframes/hub`; any release
(requires explicit human approval).
