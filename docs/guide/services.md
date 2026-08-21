---
outline: deep
---

# Cross-Plugin Services

`ctx.services` lets one integration expose a typed, namespaced capability on the shared node context; every devframe shares one context, so a registration is visible to every other. Two tiers: in-process services (`provide`/`get`) hand live objects between plugins; [wire services](#wire-services) additionally register RPC functions and advertise to browser clients.

## Providing a service

Augment `DevframeServicesRegistry` with your service's id and type, then provide it at setup:

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

Service ids prefix the providing plugin's id (`<plugin-id>:<service>`), unique per context — a second `provide()` under a taken id throws [`DF0037`](https://devfra.me/errors/DF0037). `provide()` returns a revoke function; guard idempotent setup with `ctx.services.has(id)`.

## Consuming a service

A consumer loads it via a types-only import:

```ts
import type {} from '@my-org/my-plugin' // types only: loads the augmentation

export function setup(ctx: DevframeNodeContext) {
  ctx.services.whenAvailable('my-plugin:sources', (sources) => {
    sources.register({ id: 'other-plugin:state', data: () => state })
  })
}
```

Prefer `whenAvailable` over `get`: it fires immediately if provided, else on `provide` (so mount order never matters), re-fires on revoke/re-provide, and returns an unsubscribe. `get(id)` returns the implementation or `undefined`:

```ts
ctx.services.get('my-plugin:sources')?.register(entry)
```

Ids without an augmentation type as `unknown`.

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

A **wire service** is a shared server-side capability as its own npm module: a host installs it once, every plugin calls it in-process, every client over RPC, and client UIs feature-detect it.

### Shipping one

A service package's default export is a factory returning a `DevframeServiceDefinition`:

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

Two declaration merges type it: RPC ids into `DevframeRpcServerFunctions`, and package → scope into `DevframeServicesScopeRegistry` (so a client's `services.get()` is typed).

### Declaring

Services are **declarative**: a plugin lists what it consumes, a host lists shared ones on `initHub`. The adapter resolves each package (for a plugin, **against its own dependencies** via [`importMetaUrl`](./devframe-definition#resolving-against-the-plugins-own-dependencies), so users install nothing) and constructs it:

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

Entries are optional by default — uninstalled packages are skipped (`has() === false`). Mark an entry `required: true` to fail hard: [`DF0067`](https://devfra.me/errors/DF0067) on a missing package, [`DF0068`](https://devfra.me/errors/DF0068) on an unsatisfied `version` range (otherwise a range mismatch only warns, [`DF0069`](https://devfra.me/errors/DF0069)).

### Lifecycle: ready before setup

The hub constructs every declared service (all devframes plus `initHub`) **once** — deep-merging option sets (objects recurse, arrays union-dedupe, scalars later-win; override with `mergeOptions`) — **before any `setup(ctx)` runs**. So `setup(ctx)` can consume any service (including one another devframe declared) synchronously via `ctx.services.get(pkg)`, no RPC hop.

For a runtime-only service, `ctx.services.install(input)` builds immediately; re-installing a constructed package returns the existing API and warns ([`DF0066`](https://devfra.me/errors/DF0066)) if its options can't merge.

### Feature-detecting on the client

Installed services are advertised via the `devframe:services` [shared state](./shared-state); mirrored on the client's `rpc.services`:

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

`has()`/`get()`/`keys()` are synchronous snapshots, empty before the first sync (`get()` returns `undefined`). Each handle carries the advertised `version` and `meta`.

### Built-in services

**`@devframes/service-open`** (`devframes:service:open`) opens files in the editor (`open-in-editor`, optional `line`/`column`) or OS explorer (`open-in-finder`), refusing paths outside the workspace root and extra `roots` (`DS_OPEN_0002`) and gating editors to `KNOWN_EDITORS`. Options `{ editor?, roots? }` (later wins; dirs union-merged). Supersedes `devframe/recipes/common-rpc-functions`.

**`@devframes/service-git`** (`devframes:service:git`) runs git ops over RPC — `status`, `log`, `show`, `readFile`, `diff`, `branches`, `tags`, `stage`, `unstage`, `commit` — typed, on one repo fixed at install (`{ cwd? }`). Write ops are always exposed; authorization is the host's trust boundary, and client revisions are guarded against option injection.

**`@devframes/service-shiki`** (`devframes:service:shiki`) renders [Shiki](https://shiki.style) highlighting server-side via three RPC queries — `highlight` (dual-theme HTML), `code-to-hast`, `code-to-tokens` — all client-`cacheable` and LRU-cached per `(code, lang, themes)`. Options `{ themes?, langs? }` — the light/dark pair (defaults `vitesse-light`/`vitesse-dark`; later wins) and languages to preload (union-merged).

## Services, RPC, or shared state?

- **Services** — node-to-node, in-process: live references, never crossing a wire.
- **[RPC](./rpc)** — browser-to-node: a client invokes a named function.
- **[Shared state](./shared-state)** — serializable data synced between node and every client.

A service for *other plugins*, RPC for *UIs or agents*, a [wire service](#wire-services) for both.
