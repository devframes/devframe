---
outline: deep
---

# Client Scripts & Client Context

A dock **client script** runs a plugin's code inside the **host page**. The **client context** is what every client-side surface uses to reach the hub.

> [!WARNING] Experimental
> The hub API surface is still being refined. Names may change before 1.0.

## The client host runtime

`createDevframeClientHost()` from `@devframes/hub/client` is the headless runtime a host page boots: it connects (or adopts) an RPC client, publishes the `DevframeClientContext` for `getDevframeClientContext()`, and imports each dock's client script:

```ts
// main.ts — the host app / hub page's browser entry
import { connectDevframe, createDevframeClientHost } from '@devframes/hub/client'

const rpc = await connectDevframe({ baseURL: '/__hub/' })
const { context, dispose } = await createDevframeClientHost({ rpc })
```

### Options

| Option | Description |
|--------|-------------|
| `rpc` | An already-connected `DevframeRpcClient`. When omitted, one is created via `connectDevframe(connect)`. |
| `connect` | Forwarded to `connectDevframe` when `rpc` is omitted (e.g. `baseURL` `/__hub/`). |
| `clientType` | `'standalone'` (default) — owns the page; `'embedded'` — inside a user app alongside a panel. |
| `loadClientScripts` | Import and run dock client scripts. Default `true`. |
| `renderers` | Dock renderers to register at boot, keyed by dock `type`; local wins over the hub's [renderer manifest](./hub-initiate#renderer-modules). |

A second boot per page replaces the context and warns; `dispose()` tears down listeners and unpublishes it.

## The client context

| Property | Description |
|----------|-------------|
| `rpc` | The [RPC client](./client) — server/client functions, shared state. |
| `clientType` | `'embedded'` (inside your app) or `'standalone'` (independent hub page). |
| `docks` | Dock entries and selection — `entries`, `selected`, `groupedEntries`, `switchEntry()`, `toggleEntry()`, `getStateById()`, `register()` / `update()` for [client-only docks](#client-only-docks). |
| `panel` | Dock panel state: position, size, drag/resize. |
| `commands` | Command palette: `register()`, `execute()`, `getKeybindings()`. |
| `renderers` | Dock-renderer registry — `register()`, `get()`, `has()`, `mount(entry, container)`. Routes a dock `type` to a renderer from local boot registration or the hub's [renderer manifest](./hub-initiate#renderer-modules) (local wins). `mount()` resolves a `status` of `mounted` (with `dispose`), `missing-renderer`, or `load-error` (with `error`). |
| `when` | The [when-clause](./when-clauses) context. |
| `connection` | Live [connection status](./client#handling-connection-and-auth-errors) — `status`, `error`, `events`. |

### Accessing the context

`getDevframeClientContext()` returns the context anywhere, or `undefined` until the client host has booted:

```ts
import { getDevframeClientContext } from '@devframes/hub/client'

const ctx = getDevframeClientContext()
if (ctx) {
  const modules = await ctx.rpc.call('my-plugin:get-modules')
  ctx.docks.switchEntry('my-plugin')
}
```

### Client-only docks

A client host can register a dock local to this page (unlike [node hub context](./hub) docks, synced to every viewer via `devframe:docks` shared state):

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

Client-only docks behave like server docks but never sync to the hub or other viewers; one sharing a server dock's id overrides it locally, and re-registering an owned id throws unless you pass `register(entry, true)`.

A client-only dock can also carry an inline [JSON-render](./json-render) `view` spec, rendered when a `json-render` renderer is registered at boot:

```ts
const spec = { /* a DevframeJsonRenderSpec built in the browser */ }

ctx.docks.register({
  id: 'client-playground',
  title: 'Client Playground',
  icon: 'ph:sliders-horizontal-duotone',
  type: 'json-render',
  view: { spec },
})
```

`view` also accepts `{ stateKey }` for a live shared state (as `createJsonRenderView` produces).

## Dock client scripts

A dock entry's client script is a `ClientScriptEntry` — `{ importFrom, importName? }` (`importName` defaults to `'default'`); the field depends on entry kind:

| Entry kind | Field | Runs |
|---|---|---|
| `action` | `action` | when the dock button is activated |
| `custom-render` | `renderer` | to render the entry's panel |
| `iframe` | `clientScript` (optional) | alongside the iframe panel, inside the host page |

The exported function receives the client context and two dock-scoped extras:

- **`current`** — this entry's state: `entryMeta`, `isActive`, `domElements`, `events` (`entry:activated`, `entry:deactivated`, `entry:updated`, `dom:panel:mounted`, `dom:iframe:mounted`).
- **`messages`** — an entry-scoped messages client (`category` defaults to the entry id; `info` / `warn` / `error` / `success` / `debug` shortcuts for `add()`).

```ts
import type { DockClientScriptContext } from '@devframes/hub/client'

export default async function setup(ctx: DockClientScriptContext) {
  ctx.current.events.on('entry:activated', async () => {
    const data = await ctx.rpc.call('my-plugin:get-modules')
    ctx.messages.info(`Loaded ${data.length} modules`)
  })
}
```

A failed import is retried on the next dock update.

### Shipping a client script

`importFrom` accepts two shapes:

- **A host-served URL** — a self-contained ES module. Works on every host.
- **A bare npm specifier** (`'vite-plugin-vue-tracer/client/vite-devtools'`) — resolved through the host runtime.

For a URL, attach the bundle:

```ts
await ctx.install(myDevframe, {
  dock: { clientScript: { importFrom: `/@fs/${myAgentBundlePath}` } },
})
```

Under Vite, `/@fs/<absolute path>` serves it; other hosts mount the directory statically.

### Bare npm specifiers

Bare specifiers are a **host-runtime capability**: a host advertises a resolution template at `ConnectionMeta.configs.dock.clientModuleResolution`; loaders replace `{specifier}` before import:

```ts
// A Vite host resolves bare specifiers through its own module graph.
// `@devframes/vite/hub` declares this by default.
initHub({ clientModuleResolution: '/@id/{specifier}' })
```

On a Vite host, `/@id/<specifier>` routes through Vite's resolution. Declare the dock with just the specifier:

```ts
ctx.docks.register({
  type: 'action',
  id: 'vue-tracer',
  title: 'Vue Tracer',
  icon: 'ph:crosshair-simple-duotone',
  action: { importFrom: 'vite-plugin-vue-tracer/client/vite-devtools' },
})
```

A host with no template (Next.js) supports the URL shape only; a bare specifier warns [`DF8111`](/errors/DF8111). A viewer can override with `createDevframeClientHost({ resolveClientModule })`.

Client scripts execute in the inspected page's realm (the app's `window`); anchor shared state on `globalThis` (vue-tracer's `__vue_tracer__`).

### Dual boots

One bundle can serve both as a client script (default export) and, via a globally-guarded self-boot, standalone (the [a11y inspector](/plugins/a11y)'s in-page agent).

## Iframe panels

Dock iframes are their own documents, so they connect themselves: the panel SPA calls `connectDevframe()`, discovering `./__connection.json` relative to its base. Host script and iframe share the server via RPC and shared state, or a same-origin `BroadcastChannel` for static builds.

## Shared-iframe soft navigation

A tool with many internal views (Nuxt DevTools' tabs) can surface each as a hub dock sharing **one** live iframe via soft navigation. The **anchor** owns a `frameId` and opts in with `subTabs`.

```ts
await ctx.install(nuxtDevtools, {
  dock: { frameId: 'nuxt-devtools', subTabs: { protocol: 'postmessage' } },
})
```

On mount, the host attaches a **frame-nav adapter** speaking an origin-locked `postMessage` protocol on the `devframe:frame-nav` channel:

| Message | Direction | Meaning |
|---|---|---|
| `ready` / `manifest` | frame → host | the tab list (`{ tabs, current }`), on load and on change |
| `navigate` | host → frame | show a view (`{ tabId, navTarget }`); the app routes client-side |
| `navigated` | frame → host | the app navigated internally; host highlights the matching dock |

It materializes a [client-only dock](#client-only-docks) per tab (id `<frameId>:<tabId>`), sharing the anchor's `frameId` and a `navTarget`; independent of [`groupId`](./hub#grouping-dock-entries).

### The viewer's part

A viewer keeps one iframe alive per `frameId` (shown/hidden); on mount it sets it on the anchor's dock state and announces it:

```ts
const state = ctx.docks.getStateById(anchorId)!
state.domElements.iframe = iframeEl
state.events.emit('dom:iframe:mounted', iframeEl)
```

See the "Tabbed Tool" in [`examples/hub-vite`](https://github.com/devframes/devframe/tree/main/examples/hub-vite) / [`examples/hub-next`](https://github.com/devframes/devframe/tree/main/examples/hub-next).
