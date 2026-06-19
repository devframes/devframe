---
outline: deep
---

# Scoped Context

A scoped context is a namespaced view of the devframe context that auto-prefixes every RPC id, shared-state key, and streaming channel with your tool's id, and adds a typed, persisted `settings` store. It is the preferred way to consume the context from a single tool's code — both on the server (`ctx.scope`) and in the browser (`client.scope`).

```ts
const my = ctx.scope('my-plugin')

my.rpc.register(getModules) // registers `my-plugin:get-modules`
await my.rpc.call('get-modules') // calls `my-plugin:get-modules`
const state = await my.rpc.sharedState('selection') // `my-plugin:selection`
await my.settings.project.set('theme', 'dark')
```

You hand a namespace once and stop repeating it on every id.

## Server side

`setup(ctx)` receives the full `DevframeNodeContext`. Derive a scoped view from it with `ctx.scope(id)` — conventionally your devframe `id`:

```ts twoslash
import { defineDevframe, defineRpcFunction } from 'devframe'

export default defineDevframe({
  id: 'my-plugin',
  name: 'My Plugin',
  setup(ctx) {
    const my = ctx.scope('my-plugin')

    my.rpc.register(defineRpcFunction({
      name: 'get-modules', // bare name — stored as `my-plugin:get-modules`
      type: 'query',
      handler: () => loadModules(),
    }))
  },
})

declare function loadModules(): { id: string }[]
```

`ctx.scope(id)` returns the same object for a given id on repeated calls, so it's cheap to call wherever you need it. The scoped context re-exposes the unscoped surfaces (`views`, `diagnostics`, `agent`, `host`, `cwd`, `mode`) unchanged, replaces `rpc` with the auto-namespaced surface, and keeps the original context available as `my.base`.

## Client side

`connectDevframe()` returns the RPC client; `client.scope(id)` gives the matching browser-side view:

```ts twoslash
import { connectDevframe } from 'devframe/client'

const client = await connectDevframe()
const my = client.scope('my-plugin')

const modules = await my.rpc.call('get-modules')
const selection = await my.rpc.sharedState('selection', { initialValue: { id: '' } })
const theme = await my.settings.project.get('theme')
```

The scoped surface mirrors the server: `my.rpc` carries `call` / `callEvent` / `callOptional`, `register` (server→client functions), `sharedState`, and `streaming`; `my.settings` is the top-level settings store.

## Auto-namespacing

Bare names are prefixed with `<namespace>:`. A name that already contains a `:` is treated as fully-qualified and passed through unchanged, so you can reach another tool's surface explicitly:

```ts
await my.rpc.call('get-modules') //          -> my-plugin:get-modules
await my.rpc.call('other-plugin:status') //  -> other-plugin:status (unchanged)
```

`register` is stricter: it auto-namespaces and only accepts bare names. Passing an already-namespaced name throws [`DF0034`](../errors/DF0034) — register through `ctx.base.rpc.register` if you need a fully-qualified name.

Bare names also stay fully typed: a scoped `call('get-modules')` resolves to the `my-plugin:get-modules` entry in your [RPC registry augmentation](./rpc#type-safe-client-registry), and `sharedState('selection')` to the matching [`DevframeRpcSharedStates`](./shared-state#type-safe-keys) key.

## Settings

`my.settings` is a persisted key-value store, living at the top level of the scoped context (alongside `my.rpc`, not under it). It has two scopes:

- **`project`** — per-workspace values, persisted under the host's `workspace` storage dir. Project-local settings.
- **`global`** — per-user values, persisted under the host's `global` storage dir. Machine-wide preferences.

Both are file-backed on the server and synced to the browser over the shared-state protocol, so a `set` on either side propagates to every connected peer and survives restarts.

```ts
const { settings } = my

await settings.project.set('theme', 'dark')
await settings.project.get('theme') //  'dark'
await settings.project.all() //          { theme: 'dark' }
await settings.project.delete('theme')

const off = await settings.global.onChange((value) => {
  console.log('global settings changed', value)
})
```

Every method is async because the underlying store is resolved on first access.

### Typed settings

Augment `DevframeSettingsRegistry` to type a namespace's settings shape once; `ctx.scope('my-plugin')` then types `settings.global` and `settings.project` automatically:

```ts
declare module 'devframe' {
  interface DevframeSettingsRegistry {
    'my-plugin': {
      theme: 'light' | 'dark'
      recentFiles: string[]
    }
  }
}
```

```ts
const my = ctx.scope('my-plugin')
await my.settings.project.set('theme', 'dark') // ✓ typed
await my.settings.project.set('theme', 'blue') // ✗ not assignable
```

Namespaces without an augmentation fall back to an open record.

## What's next

- [RPC](./rpc) — register and call functions
- [Shared State](./shared-state) — observable state synced across clients
- [Client](./client) — connecting from the browser
