---
outline: deep
---

# JSON-Render

JSON-render lets a devframe describe a UI as **data** — a serializable spec of
components — that any compatible frontend renders. It is **opt-in**: a plain app
pulls zero JSON-render dependencies. Two packages:

- **`@devframes/json-render`** — the framework-neutral protocol layer (spec/catalog
  types, base catalog, prop schemas, view reference, node runtime factory). Builds on
  [`@json-render/core`](https://www.npmjs.com/package/@json-render/core), with no
  Vue or DOM code.
- **`@devframes/json-render-ui`** — the reference Vue frontend implementing the
  base catalog with [`@antfu/design`](https://github.com/antfu/design); any
  compatible frontend can replace it.

## Authoring a view

`createJsonRenderView` registers the spec as shared state, validates props at
ingress, and returns a handle:

```ts
import { createJsonRenderView } from '@devframes/json-render/node'

export default defineDevframe({
  // …
  setup(ctx) {
    const view = createJsonRenderView(ctx, {
      id: 'metrics', // stable, unique within the scope
      spec: {
        root: 'root',
        elements: {
          root: { type: 'Card', props: { title: 'Live metrics' }, children: ['count'] },
          count: { type: 'Text', props: { text: { $state: '/count' } }, children: [] },
        },
        state: { count: 0 },
      },
    })

    // A structural change replaces the whole spec…
    view.update(nextSpec)
    // …while state travels as JSON-Pointer patches (only the changed path crosses the wire).
    view.patchState([{ op: 'replace', path: '/count', value: 3 }])

    // Unregisters the shared state and its listeners.
    // view.dispose()
  },
})
```

The view id is scoped — `devframe:json-render:<scope>:<id>`; `scope` defaults to
the namespace or `global`. Diagnostics fire on invalid props
([DF0038](/errors/DF0038)), a
duplicate id ([DF0039](/errors/DF0039)), a disposed-view use
([DF0040](/errors/DF0040)), and a non-serializable spec
([DF0041](/errors/DF0041)).

## The base catalog

Catalog v1 ships fourteen components — `Stack`, `Card`, `Text`, `Badge`,
`Button`, `Icon`, `Divider`, `TextInput`, `Switch`, `KeyValueTable`,
`DataTable`, `CodeBlock`, `Progress`, `Tree`. A Devframes spec **is** an
`@json-render/core` `Spec` plus a per-component Zod prop schema
(`basePropSchemas`), validated at ingress (server) and render time (client);
`$state` / `$bindState` bindings are accepted for scalar props.

## Actions and state

- **State** is a JSON-serializable `Record<string, unknown>` addressed by JSON
  Pointer.
- **Actions** are unrestricted: an element event dispatches an RPC call of the
  same name — no allowlist, so a spec can invoke any RPC method the client can
  reach. The reference bridge tracks per-action loading and surfaces RPC failures.
- **Reserved built-ins** (`setState`, `pushState`, `removeState`,
  `validateForm`) are handled client-side and never bridged to RPC.

## Rendering standalone

### Out-of-box SPA (no client build)

`@devframes/json-render-ui/spa` ships a prebuilt renderer, so an app serves a
JSON-render UI with no client build. Wrap the definition with
`createJsonRenderDevframe` to point `clientAssets` at the shipped SPA:

```ts
import { createJsonRenderDevframe } from '@devframes/json-render-ui/spa'
import { createJsonRenderView } from '@devframes/json-render/node'

export default createJsonRenderDevframe({
  id: 'my-app',
  name: 'My App',
  version,
  packageName,
  homepage,
  description,
  cli: { command: 'my-app', port: 9800 },
  setup(ctx) {
    createJsonRenderView(ctx, { id: 'main', title: 'Dashboard', spec })
  },
})
```

The SPA discovers views from the **view index** (`JSON_RENDER_INDEX_KEY`), a
shared state the node factory maintains; a single view renders full-bleed,
multiple get a top-bar segmented switcher labeled by `title`.

### Custom frontend

A custom frontend renders straight from shared state: connect with
`connectDevframe()`, read the view's state (keyed
`devframe:json-render:<scope>:<id>`), subscribe to its `updated` events, and
render each element with your own registry — the [Next hub
example](/examples/hub-next) has a React renderer.

In a **static** build the spec + state are snapshotted read-only; actions report
as unavailable, while local state and bindings still work.

### The reference frontend

`@devframes/json-render-ui` ships two self-contained prebuilt bundles,
`@devframes/json-render-ui/spa` and `@devframes/json-render-ui/hub`, pulling no
frontend package into an app's graph.

## Rendering inside a hub

The `@devframes/json-render/hub` subpath adds the `json-render` dock type, routed
through the hub's renderer registry:

```ts
// server — register a dock carrying the view's serializable reference,
// and compose the frontend as a prebuilt renderer module
import { jsonRenderUiRenderer } from '@devframes/json-render-ui/hub'
import { toJsonRenderDockEntry } from '@devframes/json-render/hub'

initHub({
  ui: createUi(),
  renderers: [jsonRenderUiRenderer()],
  configure(ctx) {
    ctx.docks.register(toJsonRenderDockEntry(view, {
      id: 'metrics',
      title: 'Metrics',
      icon: 'ph:chart-bar-duotone',
    }))
  },
})
```

The hub serves the module and publishes it in the [renderer
manifest](./hub-initiate#renderer-modules); the viewer imports it lazily on first
mount of a `json-render` dock, or shows a missing-renderer fallback without a
registration.

A host page can register a renderer **locally** instead — any implementation of
the `JsonRenderDockRenderer` contract, taking precedence over the manifest:

```ts
// host page — a locally-bundled frontend wins over the manifest module
import { createDevframeClientHost } from '@devframes/hub/client'
import { myJsonRenderDockRenderer } from './my-renderer'

const host = await createDevframeClientHost({
  renderers: { 'json-render': myJsonRenderDockRenderer },
})

// the viewer mounts the active dock into a container it owns
const result = await host.context.renderers.mount(entry, container)
if (result.status === 'mounted')
  result.dispose // tear down when the viewer decides; deactivation disposes too
```

The dock carries a serializable `JsonRenderViewRef` in two shapes: `{ stateKey }`
points at a live shared state (from `createJsonRenderView`), and `{ spec }`
embeds the spec inline for a browser-synthesized view (see [client-only
docks](./client-context#client-only-docks)).

## Swapping the frontend

The contract lives in the protocol package: `@devframes/json-render/hub` exports
`JsonRenderDockRenderer` and `JsonRenderDockMountOptions`.
`@devframes/json-render-ui` is the reference implementation, not a hard
dependency; the hub acquires no Vue. A frontend's component registry is pluggable
too, to render a subset or theme the built-ins.

See [Build your own JSON-Render frontend](./build-your-own-json-render-frontend)
and the [`json-render` example](/examples/json-render) for a runnable end-to-end
app.
