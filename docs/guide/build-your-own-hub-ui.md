# Build Your Own Hub UI

A hub viewer is a replaceable implementation of two contracts — the node-side
`ui` slot and the client-side context — so you can ship a completely custom
devtools surface (your framework, your design system) on top of the hub's
infrastructure. `@devframes/hub-ui` is the reference implementation of both;
this page is the map for writing another.

## The node seam: `DevframeHubUi`

`initHub({ ui })` takes pure data (see [the `ui`
slot](./hub-initiate#the-ui-slot)):

```ts
interface DevframeHubUi {
  viewer?: { distDir: string } // a standalone SPA served at the hub base
  embedded?: { entry: string } // a self-contained bootstrap at <base>embedded.js
  assets?: Record<string, () => string | Uint8Array> // extra UI-owned files
  configs?: () => Record<string, unknown> // static config, published as ConnectionMeta.configs.ui
}
```

Ship a function returning this object (the reference is `createUi()`), with
prebuilt assets: the viewer SPA is built with relative asset paths, and the
embedded entry is one self-contained ES module that mounts your dock into any
host page.

`configs` publishes whatever you return verbatim as
`ConnectionMeta.configs.ui` — the reference UI's `createUi({ branding })` uses
it to deliver `{ branding }`, read by the dock from the one connection
handshake it already performs, rather than a separate fetched file. The hub
never interprets this object; it's a policy-free pass-through to your own
client code. It's the read-only counterpart to `assets`: reach for `configs`
for small, structured, boot-time config, and `assets` for arbitrary served
files.

## The client contracts

A viewer renders from the hub's shared state and drives it through
`@devframes/hub/client`. The simplest boot is
[`createDevframeClientHost()`](./client-context) — it assembles the whole
`DevframeClientContext` (docks, commands, renderers, when-clauses, connection)
and loads dock client scripts for you; the reference UI assembles the same
context shape with its own reactive machinery instead. Either way, honor these
contracts:

### Dock entry types

Render the built-in variants of the open dock union
(`DevframeDockEntryRegistry` from `@devframes/hub/types`):

| Type | The viewer renders |
|---|---|
| `iframe` | the entry's `url` in a kept-alive iframe (per `frameId` for shared frames); honor `subTabs` soft navigation |
| `action` | a bar button only — activating it runs the entry's client script |
| `custom-render` | a container the entry's client script mounts into |
| `launcher` | a launch call-to-action reflecting `launcher.status` |
| `group` | one bar button collapsing its member entries |
| `~builtin` | your own native views (settings, feeds) for reserved ids |

Honor `when` / `visibility` clauses, `category` grouping (order from
`DEFAULT_CATEGORIES_ORDER` in `@devframes/hub/constants`), and the
`hub:docks:activate` broadcast.

### The renderer registry and its fallback

**Every other dock type routes through the dock-renderer registry** — build it
with `createDockRenderersContext()` from `@devframes/hub/client` so local
registrations, the hub's [renderer
manifest](./hub-initiate#renderer-modules), and the typed mount result behave
like every other viewer:

```ts
import { createDockRenderersContext } from '@devframes/hub/client'

const renderers = createDockRenderersContext({
  context: () => context,
  manifest: () => manifestState.value(), // the devframe:dock-renderers slot
})

const result = await renderers.mount(entry, container)
```

The mount result is the fallback contract. A viewer shows a visible state for
each variant instead of a dead panel:

- `{ status: 'mounted', dispose }` — the renderer owns the container; call
  `dispose` when the view unmounts.
- `{ status: 'missing-renderer' }` — render a fallback view: *No renderer for
  "`<type>`" in the current environment*. `renderers.has(type)` answers up
  front, so you can render this declaratively without a mount attempt.
- `{ status: 'load-error', error }` — the module failed to import or the
  renderer threw; render the error with a retry affordance (a failed import is
  not cached, so retrying re-imports).

### The theme contract for renderers

Renderer modules style themselves (they may attach a shadow root inside your
container). Your part: keep a live `dark` class on the mount container
reflecting your color mode, and let CSS custom properties inherit — a
`--devframe-primary` set on an ancestor rebrands rendered content too.

## Reference points

- `packages/hub-ui` — the full reference viewer (Vue, `@antfu/design`).
- [`examples/hub-vite`](/examples/hub-vite) and
  [`examples/hub-next`](/examples/hub-next) — protocol witnesses: complete
  hand-rolled viewers in ~500 lines of vanilla DOM and React respectively,
  covering docks, the drawer subsystems, the renderer registry, and the
  missing-renderer fallback.
