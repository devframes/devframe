---
outline: deep
---

# RPC

Devframe's RPC layer is type-safe bidirectional communication between your server (Node.js) and client (browser), built on [`birpc`](https://github.com/antfu/birpc) and validated at runtime with [`valibot`](https://valibot.dev/). In dev mode it runs over WebSocket; in build / SPA mode it serves a pre-computed static dump so the client still works offline.

## Overview

```mermaid
sequenceDiagram
  participant Client as Browser client
  participant Server as Node server

  Client->>Server: rpc.call('my-devframe:get-modules')
  Note over Server: handler: async () =><br/>readModules()
  Server-->>Client: [{ id, size }, …]
```

## Defining a function

```ts
import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'

export const getModules = defineRpcFunction({
  name: 'get-modules', // bare — the scope namespaces it to `my-devframe:get-modules`
  type: 'query',
  args: [v.object({ limit: v.number() })],
  returns: v.array(v.object({ id: v.string(), size: v.number() })),
  setup: ctx => ({
    handler: async ({ limit }) => {
      // `ctx` is the full DevframeNodeContext.
      return loadModules().slice(0, limit)
    },
  }),
})
```

Register it in `setup` through a [scoped context](./scoped-context) — `ctx.scope(id)` auto-namespaces ids, so you register and call by bare name:

```ts
import { defineDevframe } from 'devframe'
import { getModules } from './rpc/functions/get-modules'

export default defineDevframe({
  id: 'my-devframe',
  name: 'My Devframe',
  setup(ctx) {
    const my = ctx.scope('my-devframe')
    my.rpc.register(getModules)
  },
})
```

The unscoped `ctx.rpc.register(getModules)` works too — it's the underlying primitive the scoped surface wraps.

Place each function in its own file under `src/rpc/functions/`, and barrel them in `src/rpc/index.ts` as `const serverFunctions = [...] as const`. The same array feeds the [type-safe client registry](#type-safe-client-registry) and keeps registration order explicit. When per-file functions need to share setup-time state (channels, shared state handles, loaders), expose it through a `WeakMap<DevframeNodeContext, T>` in a sibling `src/context.ts`.

### Naming convention

Scope with your devframe id and use kebab-case for the action: `my-devframe:get-modules`, `my-devframe:read-file`, `my-devframe:trigger-rebuild`. A scoped context applies this prefix for you: `ctx.scope('my-devframe').rpc.register({ name: 'get-modules' })` stores `my-devframe:get-modules`. Define each function with a bare name and let the scope namespace it.

### Function types

| Type | Description | Cached | Static Dump |
|------|-------------|--------|-------------|
| `query` | Read operation that can change over time. | Opt-in via `cacheable` | Manual (declare `dump`) |
| `static` | Data that never changes for a given input. | Indefinitely | Automatic |
| `action` | Mutation with side effects. | Never | Never |
| `event` | Fire-and-forget; no response. | Never | Never |

Use `static` for data collected once during `setup` and shipped to read-only static / SPA clients.

### Handler arguments

Handlers accept any serializable arguments. With `args` valibot schemas, arguments are validated at the boundary:

```ts
defineRpcFunction({
  name: 'get-file',
  type: 'query',
  args: [v.object({ path: v.string(), includeSource: v.optional(v.boolean()) })],
  returns: v.object({ path: v.string(), source: v.optional(v.string()) }),
  setup: () => ({
    handler: async ({ path, includeSource }) => ({
      path,
      source: includeSource ? await readFile(path, 'utf-8') : undefined,
    }),
  }),
})
```

Prefer a single object argument (`args: [v.object({ ... })]`) over positional args — property names are self-describing and agents/IDEs work best with object shapes.

### Setup vs handler

Two ways to wire a handler:

- **`setup(ctx)`** — receives the `DevframeNodeContext` and returns `{ handler, dump? }`. Use this when you need the context (shared state, logs, `ctx.mode`, etc.).
- **`handler(...)`** — shorthand when the handler is pure and doesn't touch the context.

```ts
// With setup:
defineRpcFunction({
  name: 'count',
  type: 'query',
  setup: ctx => ({
    handler: async () => ctx.rpc.sharedState.keys().length,
  }),
})

// Shorthand:
defineRpcFunction({
  name: 'echo',
  type: 'query',
  handler: (msg: string) => msg,
})
```

## Broadcasting

`rpc.broadcast` sends a message from the server to every connected client. Through a scoped context the client method name is namespaced for you:

```ts
defineDevframe({
  id: 'my-devframe',
  name: 'My Devframe',
  setup(ctx) {
    const my = ctx.scope('my-devframe')
    watcher.on('change', (file) => {
      void my.rpc.broadcast({
        method: 'on-file-changed', // -> my-devframe:on-file-changed
        args: [{ file }],
      })
    })
  },
})
```

| Option | Type | Description |
|--------|------|-------------|
| `method` | client RPC name | Function registered on the client side. |
| `args` | any[] | Arguments passed to the client function. |
| `optional` | `boolean` | Don't throw if no client is listening. |
| `event` | `boolean` | Fire-and-forget (don't wait for responses). |
| `filter` | `(client) => boolean` | Skip specific clients. |

## Streaming

For chunk-style server→client feeds (chat deltas, log lines, build progress), use [streaming channels](./streaming) — they handle stream IDs, cancellation, replay, and Web Streams interop for you:

```ts
const channel = ctx.rpc.streaming.create<string>('my-devframe:chat', {
  replayWindow: 256,
})
const stream = channel.start()
sourceReadable.pipeTo(stream.writable)
```

See the [Streaming guide](./streaming) for the full API.

## Local invocation

A scoped `rpc.call` invokes a registered server function directly, skipping the transport — useful for cross-function composition on the server side. Bare names resolve within the namespace:

```ts
const my = ctx.scope('my-devframe')
const modules = await my.rpc.call('get-modules', { limit: 10 })
```

This wraps `ctx.rpc.invokeLocal('my-devframe:get-modules', { limit: 10 })`. Pass a fully-qualified name (containing `:`) to call another tool's function.

## Client-side calls

From the browser, [`connectDevframe`](./client) (or `getDevframeRpcClient`) returns a client. Scope it the same way to call registered functions by bare name:

```ts
import { connectDevframe } from 'devframe/client'

const client = await connectDevframe()
const my = client.scope('my-devframe')

const modules = await my.rpc.call('get-modules', { limit: 10 })
```

Client-side registration (for server→client calls) goes through `my.rpc.register()` — the mirror API of the server-side scoped `rpc.register()`.

## Type-safe client registry

Devframe exposes two augmentable interfaces — `DevframeRpcServerFunctions` (client→server calls) and `DevframeRpcClientFunctions` (server→client calls) — so each registered RPC name shows up on the typed client. Augment them once per devframe via `declare module 'devframe'`.

The recommended pattern collects every server-side definition into a const array and feeds it through `RpcDefinitionsToFunctionsWithNamespace` — it prefixes each bare definition name with your devframe id, matching the ids the scoped `register` stores at runtime:

```ts
import type { RpcDefinitionsToFunctionsWithNamespace } from 'devframe/rpc'
import { getFile, getModules } from './rpc'

const serverFunctions = [getModules, getFile] as const

declare module 'devframe' {
  interface DevframeRpcServerFunctions
    extends RpcDefinitionsToFunctionsWithNamespace<'my-devframe', typeof serverFunctions> {}
}
```

If you define functions with full namespaced names instead, use `RpcDefinitionsToFunctions<typeof serverFunctions>` (no namespace argument) and register them through the unscoped `ctx.rpc.register`.

Now `connectDevframe()` returns a client where every registered name is autocompletable and argument-typed:

```ts
import { connectDevframe } from 'devframe/client'

const my = (await connectDevframe()).scope('my-devframe')
const modules = await my.rpc.call('get-modules', { limit: 10 })
//                          ^? typed from the augmentation above
```

For one-off augmentations, declare a single key with `RpcFunctionDefinitionToFunction`:

```ts
import type { RpcFunctionDefinitionToFunction } from 'devframe/rpc'

declare module 'devframe' {
  interface DevframeRpcServerFunctions {
    'my-devframe:get-modules': RpcFunctionDefinitionToFunction<typeof getModules>
  }
}
```

For server→client calls invoked via `ctx.rpc.broadcast`, augment `DevframeRpcClientFunctions` the same way.

Augment one of the canonical module specifiers where these interfaces live — `declare module 'devframe'` or `declare module 'devframe/types'` (the form `@devframes/hub` uses). A wrapper package that re-exports the interface under a renamed alias (e.g. `DevToolsRpcServerFunctions`) is a different declaration, so augmenting the alias no longer merges into the base interface.

## Static dumps

For `static` functions, Devframe records the handler's output during `createBuild` and bakes it into the build:

```ts
defineRpcFunction({
  name: 'build-meta',
  type: 'static',
  args: [],
  returns: v.object({ version: v.string(), builtAt: v.number() }),
  setup: () => ({
    handler: async () => ({ version: '1.0.0', builtAt: Date.now() }),
  }),
})
```

For `query` functions, provide an explicit `dump` to enumerate which argument sets to pre-compute:

```ts
defineRpcFunction({
  name: 'get-session',
  type: 'query',
  setup: ctx => ({
    handler: async (id: string) => loadSession(id),
    dump: {
      inputs: [['session-a'], ['session-b']],
      fallback: { id: 'unknown', data: null },
    },
  }),
})
```

At runtime, static clients resolve `my.rpc.call('get-session', 'session-a')` from the baked dump; unmatched arguments resolve to `dump.fallback` (or throw without one).

## JSON-serializable declaration

Devframe's WS transport ships payloads using one of two encoders, picked per RPC function:

| `jsonSerializable` | Encoder | Wire prefix | Round-trips |
|---|---|---|---|
| `false` (default) | `structured-clone-es` | `s:` | `Map`, `Set`, `Date`, `BigInt`, cycles, class instances |
| `true` (opt-in) | strict `JSON.stringify` | _(unprefixed)_ | JSON-only |

The wire stays plain JSON when every participating function is JSON-flagged — debuggable in Devframe, friendly to MCP, and a good default for tools that already speak JSON.

### Discovering shape errors during dev

`jsonSerializable: true` is a contract. When a handler returns a value JSON cannot round-trip (a `Map`, a `Date`, a class instance, …), the strict serializer throws [`DF0020`](../errors/DF0020) synchronously on the offending call — surfacing the bad value next to the call site in dev:

```ts
defineRpcFunction({
  name: 'graph',
  jsonSerializable: true,
  // ⚠ throws DF0020 because Map cannot round-trip through JSON
  handler: () => ({ nodes: new Map([['a', 1]]) }),
})
```

For richer types, leave the flag unset (or `false`) — `structured-clone-es` preserves them on the wire and in build dumps. The flag is opt-in, so existing code keeps working untouched.

### MCP requires JSON

MCP tools expose their schemas as JSON Schema, and agent harnesses assume JSON-shaped data. `agent: {...}` therefore requires `jsonSerializable: true`; registering one without the other throws [`DF0019`](../errors/DF0019). See the next section for how to attach the `agent` field once your function is JSON-safe.

## Agent exposure

Add an `agent` field to surface the function to coding agents over MCP. Agent exposure is opt-in; functions without an `agent` field stay private. Agent-exposed functions must also declare `jsonSerializable: true` (see above).

```ts
defineRpcFunction({
  name: 'get-modules',
  type: 'query',
  jsonSerializable: true,
  args: [v.object({ limit: v.number() })],
  returns: v.array(v.object({ id: v.string(), size: v.number() })),
  agent: {
    description: 'List the N largest modules in the current build. Safe to call freely.',
    title: 'List modules',
    // safety inferred from type: 'query' → 'read'
  },
  setup: () => ({
    handler: async ({ limit }) => loadModules().slice(0, limit),
  }),
})
```

See [Agent-Native](./agent-native) for the full safety model and MCP integration.

## What's next

- [Shared State](./shared-state) — observable state synced across clients
- [Client](./client) — connecting from the browser
- [Agent-Native](./agent-native) — exposing RPCs to agents
