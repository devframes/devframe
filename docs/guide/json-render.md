---
outline: deep
---

# JSON-Render

JSON-render lets a devframe describe a UI as **data** — a serializable spec of
components — and have any compatible frontend render it. It is an **opt-in**
capability: a plain devframe app pulls zero JSON-render dependencies, and the
hub stays JSON-render-agnostic. You add it by depending on two packages:

- **`@devframes/json-render`** — the framework-neutral protocol layer. It owns
  the spec/catalog types, the base catalog and its per-component prop schemas,
  the serializable view reference, and the node runtime factory. It builds on
  [`@json-render/core`](https://www.npmjs.com/package/@json-render/core) as its
  wire contract and has no Vue or DOM code.
- **`@devframes/json-render-ui`** — the official reference frontend: a Vue
  renderer implementing the base catalog with [`@antfu/design`](https://github.com/antfu/design).
  Any compatible frontend library can replace it.

A single view authored once renders standalone (the app supplies a frontend
lib) and inside a hub dock (the hub supplies one), live or static.

## Authoring a view

`createJsonRenderView` augments any devframe context. It registers the spec as
shared state, validates every element's props against the base catalog at
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

The view has a stable, scoped id — `devframe:json-render:<scope>:<id>` — so a
client keeps its subscription across reconnects. `scope` defaults to the
context's namespace (from `ctx.scope('my-plugin')`) or `global`. Element props
are validated at ingress ([DF0038](/errors/DF0038)); a duplicate id
([DF0039](/errors/DF0039)), a disposed-view use ([DF0040](/errors/DF0040)), and
a non-JSON-serializable spec ([DF0041](/errors/DF0041)) each raise a diagnostic.

## The base catalog

Catalog v1 ships fourteen components — `Stack`, `Card`, `Text`, `Badge`,
`Button`, `Icon`, `Divider`, `TextInput`, `Switch`, `KeyValueTable`,
`DataTable`, `CodeBlock`, `Progress`, `Tree`. A Devframes spec **is** an
`@json-render/core` `Spec`; the one validation Devframes adds is a per-component
Zod prop schema (`basePropSchemas`), applied at both boundaries — spec ingress
(server) and render time (client). Dynamic `$state` / `$bindState` expressions
are accepted wherever a scalar prop is expected, so a valid binding never fails
validation.

## Actions and state

- **State** is a JSON-serializable `Record<string, unknown>` addressed by JSON
  Pointer. State updates travel as patches; a structural change replaces the
  whole spec.
- **Actions** are unrestricted: an element event maps to an action whose name is
  dispatched as an RPC call of the same name. There is no allowlist — a spec
  can invoke any RPC method the client can reach. The reference bridge tracks
  per-action loading state and surfaces RPC failures to the view rather than
  swallowing them.
- **Reserved built-ins** (`setState`, `pushState`, `removeState`,
  `validateForm`) are handled client-side and are never bridged to RPC.

## Rendering standalone

### Out-of-box SPA (no client build)

`@devframes/json-render-ui/spa` ships a prebuilt renderer, so an app serves a
JSON-render UI without authoring or building any client. Wrap the definition
with `createJsonRenderDevframe` — it points `clientAssets` at the shipped SPA
(`jsonRenderSpaDir`):

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
shared state the node factory maintains as views are created and disposed. A
single view renders full-bleed on its own; once more than one view is
registered, a top bar appears with the shared segmented switcher, labelling each
view with its `title` (defaulting to the view id). The
`@devframes/json-render-ui/spa` entry is node-safe — it exposes only the asset
path and the wiring helper, pulling in no Vue.

### Custom frontend

A custom frontend renders a view straight from its shared state: connect with
`connectDevframe()`, read the view's state (keyed
`devframe:json-render:<scope>:<id>`), subscribe to its `updated` events, and
render each spec element with your own component registry. The renderer
contract and the base catalog's per-component prop schemas live in the
framework-neutral `@devframes/json-render` package, so a frontend in any
framework implements the same spec — see [Build your own JSON-render
frontend](./build-your-own-json-render-frontend) and the React renderer in the
[Next hub example](/examples/hub-next).

In a **static** build the spec + state are snapshotted as a read-only render;
there is no live RPC, so actions report as unavailable and a frontend shows a
static-output notice. Local state and bindings still work.

### The reference frontend

`@devframes/json-render-ui` wraps `@antfu/design`'s Vue components directly
(`ActionButton`, `DisplayBadge`, `LayoutCard`, `FormTextInput`, `FormSwitch`,
`DisplayProgressBar`, `DisplayKeyValue`, and `DisplayIconifyRemoteIcon` for
fully dynamic, `currentColor`-inheriting icons), so it looks and behaves like
the rest of the devframe surfaces. A few catalog components stay bespoke where
`@antfu/design` has no matching primitive — `Stack`, `Text`, `CodeBlock`, the
value-tree `Tree`, and the row-clickable/loadable `DataTable`.

It ships as two self-contained prebuilt bundles — the standalone SPA
(`@devframes/json-render-ui/spa`) and the hub renderer module
(`@devframes/json-render-ui/hub`) — each inlining Vue, the upstream renderer,
and the compiled `@antfu/design` styles. A consuming app wires nothing and
pulls no frontend package into its own graph: the SPA is served verbatim as
`clientAssets`, and the hub module is imported natively by the viewer from the
renderer manifest.

## Rendering inside a hub

The hub is JSON-render-agnostic; its dock union is **open**. The
`@devframes/json-render/hub` subpath contributes the `json-render` dock type,
and viewers route it through the hub's renderer registry:

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

That `renderers` line is the whole client story for prebuilt viewers: the hub
serves `@devframes/json-render-ui`'s self-contained module and publishes it in
the [renderer manifest](./hub-initiate#renderer-modules); the viewer's registry
imports it lazily the first time a `json-render` dock mounts. Without any
registration for the type, a viewer shows its missing-renderer fallback
(*No renderer for "json-render" in the current environment*) instead of a dead
panel.

A host page that builds its own client can register a renderer **locally**
instead — it takes precedence over the manifest. The renderer is any
implementation of the `JsonRenderDockRenderer` contract the host bundles
itself (the [Next hub example](/examples/hub-next) registers a React one this
way):

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

The dock carries only a serializable `JsonRenderViewRef` — no functions cross
the wire. It comes in two shapes: `{ stateKey }` points the client at a live
shared state to subscribe to (what `createJsonRenderView` produces), while
`{ spec }` embeds the whole spec inline, so a client can synthesize a view in
the browser and render it with no shared state at all (see [client-only
docks](./client-context#client-only-docks)). The client host disposes the
renderer when the dock deactivates.

Both hub example shells dogfood this end to end: the [Vite hub](/examples/hub-vite)
consumes the manifest-served `@devframes/json-render-ui` module (Vue), and the
[Next hub](/examples/hub-next) registers a small in-example React renderer
locally over the same manifest — the same dock, two frontends, both sides of
the seam.

## Swapping the frontend

The renderer contract lives in the protocol package:
`@devframes/json-render/hub` exports `JsonRenderDockRenderer` (a hub
`DockRenderer` narrowed to the `json-render` entry) and
`JsonRenderDockMountOptions`. Implement it in any framework and plug it in at
either seam — a prebuilt module registered through `initHub({ renderers })`,
or a local registration at `createDevframeClientHost({ renderers })`.
`@devframes/json-render-ui` is the reference implementation, not a hard
dependency of the protocol; the hub acquires no Vue.

Within a frontend, the component registry is pluggable too — an implementation
maps each catalog component type to its own component, so a frontend can render
a subset or theme the built-ins without touching the protocol.

A frontend need not implement every component. When a spec references a
component the active registry lacks, the renderer isolates that element behind a
placeholder — showing the component type and a gist of its prop keys (`{ label,
onPress }`) — and logs a `console.warn`, while the rest of the view renders
normally.

See [Build your own JSON-Render frontend](./build-your-own-json-render-frontend)
for the full contract, and the [`json-render` example](/examples/json-render)
for a runnable end-to-end app.
