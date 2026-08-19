---
outline: deep
---

# Cross-Plugin Services

`ctx.services` lets one integration expose a capability on the shared node context and others consume it — typed, namespaced, and free of package dependencies. Use it whenever two plugins that may or may not be installed together need to talk: a data-source registry other plugins contribute to, a shared cache, a host capability a kit provides.

Every devframe mounted into the same host shares one context, so services registered by one `setup(ctx)` are visible to every other.

The registry has two tiers: in-process services (`provide`/`get`, this page's first half) hand live objects between plugins on the node side, and [wire services](#wire-services) additionally register RPC functions and advertise themselves to browser clients, so UIs can feature-detect a capability and degrade when it is absent.

## Providing a service

Augment the `DevframeServicesRegistry` interface with your service's id and type, then provide the implementation at setup time:

```ts
export interface SourcesService {
  register: (entry: SourceEntry) => () => void
}

declare module 'devframe' {
  interface DevframeServicesRegistry {
    'my-plugin:sources': SourcesService
  }
}

export function setup(ctx: DevframeNodeContext) {
  ctx.services.provide('my-plugin:sources', createSourcesService())
}
```

Service ids follow the RPC naming rule: prefix with the providing plugin's id (`<plugin-id>:<service>`). Ids are unique per context — a second `provide()` under a taken id throws [`DF0037`](https://devfra.me/errors/DF0037). `provide()` returns a revoke function; revoke first to replace an implementation, and guard idempotent setup paths with `ctx.services.has(id)`.

## Consuming a service

The augmentation ships in the provider's published types, so a consumer gets full typing from a types-only import — no runtime dependency:

```ts
import type {} from '@my-org/my-plugin' // types only: loads the augmentation

export function setup(ctx: DevframeNodeContext) {
  ctx.services.whenAvailable('my-plugin:sources', (sources) => {
    sources.register({ id: 'other-plugin:state', data: () => state })
  })
}
```

Prefer `whenAvailable` over `get`: it runs the callback immediately when the service is already provided and otherwise on `provide`, so the mount order of provider and consumer never matters. The callback re-fires if a service is revoked and provided again; the returned function unsubscribes.

`get(id)` returns the current implementation (or `undefined`) for one-shot lookups where absence is fine:

```ts
ctx.services.get('my-plugin:sources')?.register(entry)
```

Ids without a published augmentation still work — they type as `unknown`, and the consumer narrows with its own structural interface.

## The host surface

```ts
interface DevframeServicesHost {
  provide: (id, service) => () => void // throws DF0037 on duplicates
  get: (id) => service | undefined
  has: (id) => boolean
  whenAvailable: (id, callback) => () => void
  keys: () => string[]
  // wire-service tier
  install: (input, options?) => Promise<api | undefined>
  ready: () => Promise<void>
}
```

## Wire services

A **wire service** is a shared server-side capability packaged as its own npm module — open-in-editor, syntax highlighting, anything several plugins would otherwise re-implement and re-bundle. A host installs it once; every plugin calls it in-process, every client calls it over RPC, and client UIs feature-detect it to fall back gracefully (hide the "open in editor" button, render un-highlighted code).

### Shipping one

A service package's default export is its factory, returning a `DevframeServiceDefinition`:

```ts
export interface OpenServiceApi {
  openInEditor: (input: { path: string, line?: number, column?: number }) => Promise<void>
}

export default function createOpenService(options?: OpenServiceOptions): DevframeServiceDefinition<OpenServiceApi, OpenServiceOptions> {
  return {
    package: '@devframes/service-open', // the registry key
    version: '1.0.0', // advertised; checked against declared ranges
    scope: 'devframes:service:open', // RPC namespace
    options,
    setup(ctx, { options }) {
      // `ctx` is pre-scoped: this registers `devframes:service:open:open-in-editor`
      ctx.rpc.register({ name: 'open-in-editor', handler: input => api.openInEditor(input) })
      return api // the node API served from ctx.services.get(package)
    },
  }
}
```

Two declaration merges make it fully typed for consumers: the fully-qualified RPC ids go into `DevframeRpcServerFunctions`, and the package → scope mapping into `DevframeServicesScopeRegistry` (so a client's `services.get()` returns a scoped, typed RPC handle).

### Declaring

Services are **declarative**. A plugin lists what it consumes on its definition; a host lists shared ones on `initHub`. The adapter resolves each package — for a plugin, **against the plugin's own dependencies** via the definition's [`importMetaUrl`](./devframe-definition#resolving-against-the-plugins-own-dependencies), so a plugin ships a service package as its own dependency and users install nothing extra — and constructs it:

```ts
// plugin side — on the definition
defineDevframe({
  importMetaUrl: import.meta.url, // resolution base for the declared packages
  services: [
    { package: '@devframes/service-open' },
    { package: '@devframes/service-shiki', version: '^1', options: { langs: ['vue'] } },
  ],
})

// host side — shared services on initHub
initHub({
  services: [createShikiService({ themes })],
  devframes: [/* … */],
})
```

Entries are optional by default — a package that isn't installed is skipped and clients see `has() === false`. Mark an entry `required: true` to fail hard instead ([`DF0067`](https://devfra.me/errors/DF0067) on a missing package, [`DF0068`](https://devfra.me/errors/DF0068) on an unsatisfied `version` range; without it a range mismatch only warns with [`DF0069`](https://devfra.me/errors/DF0069)).

### Lifecycle: ready before setup

Services are constructed and made ready **before any `setup(ctx)` runs**. The hub collects every declared service (across all devframes plus `initHub`), constructs each **once** — deep-merging the option sets from every declarer (objects recurse, arrays union-dedupe, scalars take the later value; a service may override with its own `mergeOptions`) — and only then runs the setups. So `setup(ctx)` can consume a service synchronously via `ctx.services.get(pkg)`, including one another devframe declared.

Server-side consumers get the node API from the same registry — `ctx.services.get('@devframes/service-open')` or `whenAvailable` — with no RPC hop.

Declarative covers the common case. For a service whose configuration is only known at runtime, `ctx.services.install(input)` is the dynamic escape hatch: after the pre-setup construction it builds immediately; re-installing an already-constructed package returns the existing API and warns ([`DF0066`](https://devfra.me/errors/DF0066)) if it carried options that can no longer merge.

### Feature-detecting on the client

Installed services are advertised through the `devframe:services` [shared state](./shared-state); the client mirrors it on `rpc.services`:

```ts
const rpc = await connectDevframe()

if (rpc.services.has('@devframes/service-open')) {
  const open = rpc.services.get('@devframes/service-open')!
  await open.rpc.call('open-in-editor', { path })
}

// reactive UI: subscribe to the underlying shared state
const state = await rpc.services.state()
state.on('updated', render)
```

`has()`/`get()`/`keys()` are synchronous snapshots of the advertisement — before the first sync lands they read as empty, and `get()` returns `undefined` rather than throwing, so the natural shape of consuming code is "render the fallback until the service appears". Each handle carries the advertised `version` and `meta` for finer gating.

### Built-in services

**`@devframes/service-open`** (`devframes:service:open`) opens files in the user's editor (`open-in-editor`, with optional `line`/`column`) or reveals them in the OS file explorer (`open-in-finder`). Paths may be absolute or relative to the workspace root (so a client with only a workspace-relative path — a message's file position, say — calls it directly); the service refuses anything outside the workspace root and the configured extra `roots` (`DS_OPEN_0002`), and gates editor commands to the `KNOWN_EDITORS` picklist. Options: `{ editor?, roots? }` — the preferred editor (later installer wins) and additional openable directories (merged as a union). It supersedes the per-plugin `devframe/recipes/common-rpc-functions` registrations, now deprecated.

**`@devframes/service-shiki`** (`devframes:service:shiki`) renders [Shiki](https://shiki.style) syntax highlighting on the server, so plugin bundles stop shipping grammars and themes. Three RPC queries — `highlight` (dual-theme HTML), `code-to-hast`, and `code-to-tokens` (for renderers that own their DOM, e.g. diff views) — all client-`cacheable` and LRU-cached server-side per `(code, lang, themes)`. Unknown languages degrade to plain text. Options: `{ themes?, langs? }` — the default light/dark pair (defaults `vitesse-light`/`vitesse-dark`, matching the design system; later installer wins) and languages to eagerly load (merged as a union).

## Services, RPC, or shared state?

Each mechanism covers a different direction of travel:

- **Services** — node-to-node, in-process: one plugin hands another an object with methods. Values never cross a wire, so they can hold live references and functions.
- **[RPC](./rpc)** — browser-to-node: a client invokes a named function over the connection.
- **[Shared state](./shared-state)** — data synchronized between node and every connected client; values must serialize.

A capability meant for *other plugins* belongs in a service; a capability meant for *UIs or agents* belongs in RPC. A capability meant for both — and shared across many plugins — is a [wire service](#wire-services), which combines all three: a node API for plugins, scoped RPC for clients, and a shared-state advertisement for feature-detection.
