---
outline: deep
---

# Cross-Plugin Services

`ctx.services` lets one integration expose a capability on the shared node context and others consume it — typed, namespaced, and free of package dependencies. Use it whenever two plugins that may or may not be installed together need to talk: a data-source registry other plugins contribute to, a shared cache, a host capability a kit provides.

Every devframe mounted into the same host shares one context, so services registered by one `setup(ctx)` are visible to every other.

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
}
```

## Services, RPC, or shared state?

Each mechanism covers a different direction of travel:

- **Services** — node-to-node, in-process: one plugin hands another an object with methods. Values never cross a wire, so they can hold live references and functions.
- **[RPC](./rpc)** — browser-to-node: a client invokes a named function over the connection.
- **[Shared state](./shared-state)** — data synchronized between node and every connected client; values must serialize.

A capability meant for *other plugins* belongs in a service; a capability meant for *UIs or agents* belongs in RPC.
