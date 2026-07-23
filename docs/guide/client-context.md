---
outline: deep
---

# Client Scripts & Client Context

In a hub, a plugin can run code inside the **host page** — the page being inspected — through a dock **client script**. The **client context** is the object every client-side surface (dock client scripts, viewer UIs, your own app code) uses to talk to the hub: RPC, dock state, the command palette, and the when-clause context.

> [!WARNING] Experimental
> The hub API surface is still being refined. Names may change before 1.0.

## The client host runtime

`createDevframeClientHost()` from `@devframes/hub/client` is the headless browser runtime a host page boots. When it runs it:

1. Connects an RPC client — or adopts one you already made.
2. Assembles the `DevframeClientContext` (panel, docks, commands, when) from the hub's shared state.
3. Publishes the context to a global slot, so `getDevframeClientContext()` can read it from anywhere in the page.
4. Imports each dock entry's client script into the page and calls it with the context.

The host page owns the boot — one import from its own browser entry starts the runtime, and your HTML stays untouched:

```ts
// main.ts — the host app / hub page's browser entry
import { connectDevframe, createDevframeClientHost } from '@devframes/hub/client'

const rpc = await connectDevframe({ baseURL: '/__hub/' })
const { context, dispose } = await createDevframeClientHost({ rpc })
```

Viewers with an HTML pipeline layer injection on top: `@vitejs/devtools` wraps this boot in the client entry its Vite plugin injects through `transformIndexHtml`, while the devframe examples import it from the app entry directly. Either way the same runtime executes in the page.

### Options

| Option | Description |
|--------|-------------|
| `rpc` | An already-connected `DevframeRpcClient`. When omitted, one is created via `connectDevframe(connect)`. |
| `connect` | Options forwarded to `connectDevframe` when `rpc` is not supplied — pass `baseURL` to point at the hub's connection-meta mount (e.g. `/__hub/`). |
| `clientType` | `'standalone'` (default) — the runtime owns the whole page (a hub UI). `'embedded'` — the runtime lives inside a user app alongside a panel. |
| `loadClientScripts` | Import and run dock entries' client scripts. Default `true`. |
| `renderers` | Dock renderers to register at boot, keyed by dock `type` (e.g. `{ 'json-render': createJsonRenderDockRenderer() }` from `@devframes/json-render-ui`). The hub ships none. |

Boot the host once per page: a second boot replaces the published context and logs a warning. `dispose()` tears down its listeners and unpublishes the context it owns.

## The client context

`DevframeClientContext` is the client-side counterpart of the hub's node context: one object carrying everything a client surface needs.

| Property | Description |
|----------|-------------|
| `rpc` | The [RPC client](./client) — call server functions, register client-side functions, access shared state. |
| `clientType` | `'embedded'` (runtime inside your app) or `'standalone'` (independent hub page). |
| `docks` | Dock entries and selection — `entries`, `selected`, `groupedEntries`, `switchEntry()`, `toggleEntry()`, `getStateById()`, plus `register()` / `update()` for [client-only docks](#client-only-docks). |
| `panel` | Dock panel state: position, size, drag/resize flags. |
| `commands` | The command palette: `register()`, `execute()`, `getKeybindings()`. |
| `renderers` | Dock-renderer registry — `register()`, `get()`, `has()`, `mount(entry, container)`. Routes a dock `type` to a host-registered renderer (e.g. [JSON-Render](./json-render)); the hub ships none. |
| `when` | The [when-clause](./when-clauses) evaluation context. |
| `connection` | The client's live [connection status](./client#handling-connection-and-auth-errors) — `status`, `error`, and `events` — so a viewer can render one central connection indicator for every docked plugin. |

### Accessing the context

From anywhere in the host page, use `getDevframeClientContext()`. It returns `undefined` until the client host finishes booting:

```ts
import { getDevframeClientContext } from '@devframes/hub/client'

const ctx = getDevframeClientContext()
if (ctx) {
  const modules = await ctx.rpc.call('my-plugin:get-modules')
  ctx.docks.switchEntry('my-plugin')
}
```

### Client-only docks

The [node hub context](./hub) registers docks that flow into the `devframe:docks` shared state and reach every connected viewer. A client host can also register a dock that lives only in this page, for a view a host page synthesizes itself:

```ts
const handle = ctx.docks.register({
  id: 'my-local-view',
  title: 'Local',
  icon: 'ph:cube-duotone',
  type: 'custom-render',
  renderer: { importFrom: '/my-view.mjs' },
})

handle.update({ badge: '3' }) // patch it in place (the id is immutable)
handle.dispose() // remove it
```

Client-only docks merge into the same `docks.entries` list, group, select, and load their client scripts exactly like server docks — they just never sync to the hub or other viewers. A client dock sharing an id with a server dock overrides it locally. `ctx.docks.update(entry)` replaces a previously registered client dock wholesale. Registering an id that a client dock already owns throws unless you pass `register(entry, true)`.

A client-only dock can render a [JSON-render](./json-render) view the page authors itself. Carry the spec **inline** in the dock's `view` — no shared state, no server round-trip — and register a `json-render` dock. With a `json-render` renderer registered at boot, it renders through the same path as a server-authored view:

```ts
const spec = { /* a DevframeJsonRenderSpec built in the browser */ }

ctx.docks.register({
  id: 'client-metrics',
  title: 'Client Metrics',
  icon: 'ph:gauge-duotone',
  type: 'json-render',
  view: { spec },
})
```

The `view` field accepts either `{ spec }` (rendered inline, static) or `{ stateKey }` (subscribed to a live shared state, the shape `createJsonRenderView` produces server-side).

## Dock client scripts

A dock entry declares its client script as a `ClientScriptEntry` — `{ importFrom, importName? }`, where `importName` defaults to `'default'`. The field depends on the entry kind:

| Entry kind | Field | Runs |
|---|---|---|
| `action` | `action` | when the dock button is activated |
| `custom-render` | `renderer` | to render the entry's panel |
| `iframe` | `clientScript` (optional) | alongside the iframe panel, inside the host page |

The client host imports `importFrom` with a native dynamic import at runtime — the specifier is a URL served by the host, not a build-time module — and calls the exported function with the client context, extended with two dock-scoped extras:

- **`current`** — this entry's state: `entryMeta`, `isActive`, `domElements`, and `events` (`entry:activated`, `entry:deactivated`, `entry:updated`, `dom:panel:mounted`, `dom:iframe:mounted`).
- **`messages`** — a messages client scoped to the entry: messages it adds default their `category` to the entry id, and the per-level shortcuts (`info` / `warn` / `error` / `success` / `debug`) delegate to `add()`.

```ts
import type { DockClientScriptContext } from '@devframes/hub/client'

export default async function setup(ctx: DockClientScriptContext) {
  ctx.current.events.on('entry:activated', async () => {
    const data = await ctx.rpc.call('my-plugin:get-modules')
    ctx.messages.info(`Loaded ${data.length} modules`)
  })
}
```

A script that fails to import is logged and retried on the next dock update.

### Shipping a client script

Build the script as a single self-contained ES module — it loads outside any chunk graph or import map. Attach it when mounting the devframe:

```ts
await mountDevframe(ctx, myDevframe, {
  dock: { clientScript: { importFrom: `/@fs/${myAgentBundlePath}` } },
})
```

Under Vite, `/@fs/<absolute path>` serves the built bundle directly; other hosts mount the bundle's directory statically and pass that URL instead.

### Dual boots

The [a11y inspector](/plugins/a11y)'s in-page agent is the canonical client script, and it boots both ways from one bundle: the default export accepts the client-script context (mirroring each scan into the hub's messages feed), while a deferred, globally-guarded self-boot lets a plain `<script type="module">` start the same agent outside a hub. The context-ful call wins because the hub invokes the default export before the deferred self-boot runs.

## Iframe panels

Dock iframes are their own documents, so they connect themselves instead of reading the host page's context: the panel SPA calls `connectDevframe()`, which discovers `./__connection.json` relative to its own base — `mountDevframe` serves the hub's connection meta under every dock base for exactly this. The client script (host page) and the iframe panel then share the server through RPC and shared state, or a same-origin `BroadcastChannel` when the loop must survive static builds.
