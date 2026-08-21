# Build Your Own Hub UI

A hub viewer implements two contracts — the node-side `ui` slot and the
client-side context — to ship a custom devtools surface on the hub's
infrastructure. `@devframes/hub-ui` is the reference; this page maps out writing
another.

## The node seam: `DevframeHubUi`

`initHub({ ui })` takes pure data (see [the `ui`
slot](./hub-initiate#the-ui-slot)):

```ts
interface DevframeHubUi {
  viewer?: { distDir: string } // a standalone SPA served at the hub base
  embedded?: { entry: string } // a self-contained bootstrap at <base>embedded.js
  assets?: Record<string, () => string | Uint8Array> // extra UI-owned files
  setup?: (ctx) => void | Promise<void> // publish static config via ctx.staticConfig
}
```

Ship a function returning this object (the reference is `createUi()`) with
prebuilt assets: the viewer SPA uses relative asset paths, and the embedded
entry is a self-contained ES module that mounts your dock into any host page.

`setup(ctx)` runs once during hub init — write boot-time config to
`ctx.staticConfig`, serialized into `ConnectionMeta.configs` and read by the
client from its connection handshake. The reference UI sets
`ctx.staticConfig.ui = { branding, … }`; the hub never interprets what you
write.

## The client contracts

A viewer renders from the hub's shared state via `@devframes/hub/client`. The
simplest boot is [`createDevframeClientHost()`](./client-context), which
assembles the whole `DevframeClientContext` (docks, commands, renderers,
when-clauses, connection) and loads dock client scripts. Honor these contracts:

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

An `iframe` entry serving its UI from a [remote assets package](./client-assets)
can report those assets unreachable: its fallback page posts a
`RemoteAssetsErrorMessage` (`DEVFRAME_REMOTE_ASSETS_ERROR_MESSAGE_TYPE`, both
from `@devframes/hub/constants`) to `window.parent`. Match it against the frame's
`contentWindow` to offer the install command and a retry; leaving it alone keeps
the fallback page visible.

### The renderer registry and its fallback

**Every other dock type routes through the dock-renderer registry** — build it
with `createDockRenderersContext()` from `@devframes/hub/client`, wiring local
registrations and the hub's [renderer manifest](./hub-initiate#renderer-modules):

```ts
import { createDockRenderersContext } from '@devframes/hub/client'

const renderers = createDockRenderersContext({
  context: () => context,
  manifest: () => manifestState.value(), // the devframe:dock-renderers slot
})

const result = await renderers.mount(entry, container)
```

Show a visible state for each mount-result variant:

- `{ status: 'mounted', dispose }` — the renderer owns the container; call
  `dispose` when the view unmounts.
- `{ status: 'missing-renderer' }` — render a fallback: *No renderer for
  "`<type>`" in the current environment* (`renderers.has(type)` answers up front).
- `{ status: 'load-error', error }` — the module failed to import or the
  renderer threw; render the error with a retry (retrying re-imports).

### The theme contract for renderers

Renderer modules style themselves (possibly attaching a shadow root inside your
container). Keep a live `dark` class on the mount container for your color mode,
and let CSS custom properties inherit — a `--devframe-primary` on an ancestor
rebrands rendered content.

## Reference points

- `packages/hub-ui` — the full reference viewer (Vue, `@antfu/design`).
- [`examples/hub-vite`](https://github.com/devframes/devframe/tree/main/examples/hub-vite) and
  [`examples/hub-next`](https://github.com/devframes/devframe/tree/main/examples/hub-next) — protocol witnesses: hand-rolled
  viewers in vanilla DOM and React, covering docks, the drawer subsystems, the
  renderer registry, and the missing-renderer fallback.
