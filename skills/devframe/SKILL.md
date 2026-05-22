---
name: devframe
description: >
  Use when building a devtool with devframe — the
  framework- and build-tool-agnostic foundation for defining a
  devtool once and serving it in many places. Covers
  DevframeDefinition, picking the right deployment adapter
  (cli / build / spa / vite / embedded / mcp), designing RPC
  contracts, exposing an agent-native surface over MCP, and
  wiring the author's SPA client. For host-level features (docks,
  terminals, palette, etc.), the devframe can be mounted into a
  host that provides them — Vite DevTools is one supported target,
  reached via the `vite` adapter. Triggers on `devframe` imports,
  `defineDevframe`, `createCli`, `createMcpServer`,
  `connectDevframe`, and on migrations of existing inspectors
  (eslint-config-inspector, unocss-inspector,
  node-modules-inspector-style tools) to devframe.
---

# devframe skill

**Devframe is an asset: define your devtool once, serve it anywhere.** A devtool built on devframe is a single `DevframeDefinition` plus an author-provided SPA — the same definition deploys through a set of pluggable adapters (standalone CLI, static report, embedded SPA, MCP server, mounted into a host, etc.). Devframe is framework- and build-tool-agnostic; it has no Vite dependency and makes no UI-framework assumption.

Devframe describes one tool. If you need host-level features (cross-tool palette, integrated terminals, dock aggregation), mount the devframe into a host that provides them — [Vite DevTools](https://devtools.vite.dev/) is the canonical example, reached via the `vite` adapter — or build your own host adapter. `devframe` itself must not depend on Vite or any `@vitejs/*` package.

Full reference: [devfra.me/](https://devfra.me/).

## When to use devframe

All adapter factories share the shape `createXxx(devframeDef, options?)`.

| Author goal | Factory | Entry |
|-------------|---------|-------|
| Standalone CLI for local use | `createCli(def, options?)` | `devframe/adapters/cli` |
| Run the dev server programmatically (any CLI framework) | `createDevServer(def, options?)` | `devframe/adapters/dev` |
| Self-contained static deploy with baked data | `createBuild(def, options?)` | `devframe/adapters/build` |
| Mount into a host (Vite DevTools or any compatible host) | `createPluginFromDevframe(def, options?)` | `@vitejs/devtools-kit/node` |
| Register dynamically at runtime | `createEmbedded(def, { ctx })` | `devframe/adapters/embedded` |
| Expose to coding agents (MCP) | `createMcpServer(def, options?)` | `devframe/adapters/mcp` *(experimental)* |

The same `DevframeDefinition` runs under every adapter — pick based on deployment, not on what the tool does.

For Vite-based hosts that don't use the kit (Nuxt, Astro, SolidStart, plain Vite apps), `devframe/helpers/vite` exports `viteDevBridge(def, options?)` — a Vite plugin that mounts the SPA (static mode) or starts the RPC + WS bridge alongside the host's dev server (`devMiddleware: true`). Not an adapter; just a Vite integration helper.

## Minimum viable devframe

```ts
import { defineDevframe, defineRpcFunction } from 'devframe'

export default defineDevframe({
  id: 'my-inspector',
  name: 'My Inspector',
  icon: 'ph:magnifying-glass-duotone',
  cli: { distDir: './client/dist' },
  setup(ctx) {
    ctx.rpc.register(defineRpcFunction({
      name: 'my-inspector:get-stats',
      type: 'static',
      handler: () => ({ count: 42 }),
    }))
  },
})
```

`setup(ctx)` registers RPC functions, shared state, diagnostics, and any other devframe-level wiring. Host adapters can augment `ctx` with extra surfaces — for example, mounting into Vite DevTools via `createPluginFromDevframe(d)` exposes `docks`, `terminals`, `messages`, and `commands` on the augmented context, and the kit auto-derives an iframe dock entry from `id` / `name` / `icon` / `basePath`. For richer host-side behaviour (custom-render, terminals, palette commands) pass `options.setup` to `createPluginFromDevframe`.

See `templates/counter-devframe.ts` for a runnable counter example, `templates/spa-devframe.ts` for an SPA-ready shape, and `templates/vite-client.ts` for the author's client entry.

## Project layout

Once a devframe grows past a handful of RPC functions, split them out — one file per function under `src/rpc/functions/`, with `src/rpc/index.ts` as the barrel. The `functions/` subdirectory leaves room for sibling files like `src/rpc/utils.ts` (helpers, type aliases) as the surface grows. Each function file exports a named const; the barrel collects them into a `const serverFunctions = [...] as const` that feeds the type-safe client registry recipe (`RpcDefinitionsToFunctions<typeof serverFunctions>`).

```ts
// src/rpc/functions/list-files.ts
import { defineRpcFunction } from 'devframe'
import { getMyToolContext } from '../../context'

export const listFiles = defineRpcFunction({
  name: 'my-tool:list-files',
  type: 'query',
  jsonSerializable: true,
  setup: (ctx) => {
    const { loaders } = getMyToolContext(ctx)
    return { handler: () => loaders.list() }
  },
})
```

```ts
// src/rpc/index.ts
import { getCwd } from './functions/get-cwd'
import { listFiles } from './functions/list-files'

export const serverFunctions = [getCwd, listFiles] as const

declare module 'devframe' {
  interface DevToolsRpcServerFunctions
    extends import('devframe/rpc').RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
```

```ts
// src/devframe.ts
import { defineDevframe } from 'devframe/types'
import { setMyToolContext } from './context'
import { serverFunctions } from './rpc'

export default defineDevframe({
  id: 'my-tool',
  setup(ctx) {
    setMyToolContext(ctx, { loaders: createLoaders() })
    serverFunctions.forEach(fn => ctx.rpc.register(fn))
  },
})
```

### Sharing setup-time state via `src/context.ts`

When per-file RPCs need access to runtime values that `setup(ctx)` constructs once — streaming channels, shared state handles, watchers, loaders, caches — expose them through a `WeakMap<DevToolsNodeContext, T>` in a sibling `src/context.ts`. This mirrors the framework's own `internalContextMap` in `packages/devframe/src/node/internal/context.ts`. The WeakMap keys off the existing `DevToolsNodeContext` so contexts are garbage-collected automatically when the host tears down.

```ts
// src/context.ts
import type { DevToolsNodeContext } from 'devframe/types'

export interface MyToolContext {
  loaders: { list: () => Promise<string[]> }
  // …channels, shared state handles, watchers, etc.
}

const map = new WeakMap<DevToolsNodeContext, MyToolContext>()

export function setMyToolContext(ctx: DevToolsNodeContext, value: MyToolContext): void {
  map.set(ctx, value)
}

export function getMyToolContext(ctx: DevToolsNodeContext): MyToolContext {
  const value = map.get(ctx)
  if (!value)
    throw new Error('my-tool context not initialised — call setMyToolContext in devframe.setup')
  return value
}
```

Stateless RPCs and tiny demos can keep the inline shorthand inside `setup(ctx)` — reach for `src/rpc/functions/` and `src/context.ts` once you have more than one or two functions, or any shared setup state.

## Namespacing

**Always prefix** RPC names, dock IDs, command IDs, shared-state keys, and agent tool IDs with the devframe `id`:

```ts
'my-inspector:get-modules' // ✓
'my-inspector:state' // ✓
'get-modules' // ✗ — may collide with other devframes sharing the host
```

## DevToolsNodeContext at a glance

`setup(ctx)` receives the framework-neutral server-side surface. Each host corresponds to a [docs](https://devfra.me/) page:

| Host | Purpose |
|------|---------|
| `ctx.rpc` | Register RPC functions, broadcast, shared state, streaming channels |
| `ctx.views` | Serve static files via `hostStatic(base, distDir)` |
| `ctx.diagnostics` | Structured diagnostics host (nostics) — register custom error codes |
| `ctx.agent` | Expose tools + resources to coding agents (experimental) |
| `ctx.host` | Runtime abstraction — `mountStatic`, `resolveOrigin`, `getStorageDir` |
| `ctx.mode` | `'dev'` or `'build'` — gate setup work per runtime |

> Hosts can augment `ctx` with additional surfaces (e.g. Vite DevTools' `docks`, `terminals`, `messages`, `commands`, `createJsonRenderer`). Consult the host's docs — for Vite DevTools, see the [`vite-devtools-kit` skill](../../skills/vite-devtools-kit).

## RPC contracts

```ts
import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'

const getModules = defineRpcFunction({
  name: 'my-inspector:get-modules',
  type: 'query',
  jsonSerializable: true,
  args: [v.object({ limit: v.number() })],
  returns: v.array(v.object({ id: v.string(), size: v.number() })),
  setup: ctx => ({
    handler: async ({ limit }) => loadModules().slice(0, limit),
  }),
})
```

| Type | Use when | Cached | Static dump |
|------|----------|--------|-------------|
| `'static'` | Data constant for a given input — dump at build time | Indefinitely | Automatic |
| `'query'`  | Read that may change; optional `dump` for build adapters | Opt-in via `cacheable` | Manual |
| `'action'` | Server-state mutation | Never | Never |
| `'event'`  | Fire-and-forget; no response | Never | Never |

Add valibot schemas when the RPC is user-facing, when you want static dumps, or when you expose it to agents. Prefer a **single object arg** (`args: [v.object({ ... })]`) over positional args — property names self-document and agents rely on them.

### `jsonSerializable` (wire + dump format)

`jsonSerializable` declares the on-wire / on-disk shape contract:

| Value | Encoder | Wire prefix | Round-trips |
|-------|---------|-------------|-------------|
| `false` (default) | `structured-clone-es` | `s:` | `Map`, `Set`, `Date`, `BigInt`, cycles, class instances |
| `true` (opt-in) | strict `JSON.stringify` | _(unprefixed)_ | JSON-only |

Set `jsonSerializable: true` when your handler returns plain JSON shapes — the strict serializer **throws `DF0020`** synchronously on the offending call when it sees a value JSON cannot round-trip (Map/Set/Date/BigInt/class instance/`undefined`-in-array). Errors surface in dev next to the call that introduced them, not silently at build time.

`agent: {...}` requires `jsonSerializable: true` (registration throws `DF0019` otherwise). MCP tools speak JSON — opting into the agent surface is also opting into JSON-only data.

`ctx.rpc.broadcast({ method, args, optional?, event?, filter? })` pushes to every connected client. `ctx.rpc.invokeLocal(name, ...args)` calls a server function without going through transport (useful for cross-function composition).

## Shared state

```ts
const state = await ctx.rpc.sharedState.get('my-inspector:state', {
  initialValue: { count: 0, items: [] as string[] },
})

state.mutate((draft) => {
  draft.count += 1
  draft.items.push('tick')
})
```

- Values must be serializable — no functions, no circular refs.
- Mutations round-trip to all clients; the host tracks `syncIds` to avoid replay loops.
- Prefer shared state over ad-hoc RPC events for UI that must reappear after reconnect.

## Streaming channels

For chunk-style data flowing in either direction — LLM deltas, log tails, build progress, file uploads, mic / screen-share frames — use a streaming channel instead of inventing `action + delta/end` events. The same `channel` object handles both directions:

```ts
const channel = ctx.rpc.streaming.create<string>('my-inspector:tokens', {
  replayWindow: 256, // server keeps last N chunks per stream id
  closedStreamRetention: 30_000, // ms to hold finished streams for late subscribers
})
```

### Server-to-client (the common case)

```ts
// Server — typically inside an action handler that returns the stream id
const stream = channel.start({ id: 'optional-stream-id' })
stream.write(token) // imperative
stream.error(err) // terminal failure
stream.close() // terminal success
stream.signal // AbortSignal — flips when consumers cancel or all subscribers drop
stream.writable // WritableStream<T> for `pipeTo`-style consumption

// Convenience — start + pipe in one call:
await channel.pipeFrom(sourceReadable, { id: 'optional' })

// Client
const reader = rpc.streaming.subscribe<string>('my-inspector:tokens', streamId)
for await (const token of reader) renderToken(token)
// Or: reader.readable.pipeTo(domWritable)
reader.cancel() // server `stream.signal` aborts
```

### Client-to-server uploads

The same channel exposes `openInbound()` for the server side of a client→server upload. Pair it with a normal action that returns the id:

```ts
// Server
ctx.rpc.register(defineRpcFunction({
  name: 'my-inspector:upload-file',
  type: 'action',
  args: [v.object({ name: v.string() })],
  returns: v.object({ uploadId: v.string() }),
  handler: async ({ name }) => {
    const reader = channel.openInbound()
    ;(async () => {
      for await (const chunk of reader) saveChunk(chunk)
    })()
    return { uploadId: reader.id }
  },
}))

// Client
const { uploadId } = await rpc.call('my-inspector:upload-file', { name: 'foo' })
const upload = rpc.streaming.upload<Uint8Array>('my-inspector:files', uploadId)
fileReadable.pipeTo(upload.writable, { signal: upload.signal })
```

Client disconnect surfaces as `UploadDisconnected` to the server's `for await`. Server-side `reader.cancel()` broadcasts `upload-cancel` to the uploading session, flipping `upload.signal`.

### Lifecycle

| Event | Server | Client |
|-------|--------|--------|
| `stream.close()` / `stream.error(err)` | broadcasts `end` to subscribers | `for await` resolves / throws |
| `reader.cancel()` (last subscriber) | `stream.signal` aborts | reader marked cancelled |
| WS disconnects (last subscriber drops) | `stream.signal` aborts | reader auto-resubscribes after re-trust |

Producers should always poll `stream.signal.aborted` and exit cooperatively.

### Web / Node Streams interop

Web Streams are the canonical surface. Node 17+ ships free converters:

```ts
import { Readable, Writable } from 'node:stream'

sourceNodeReadable.pipe(Writable.fromWeb(stream.writable))
Readable.fromWeb(reader.readable).pipe(targetNodeWritable)
```

### When to use streaming vs events vs shared state

| Use streaming for | Use `event`-typed RPC for | Use shared state for |
|-------------------|---------------------------|----------------------|
| Token / chunk feeds, uploads | Notifications without payload (`refresh`) | Long-lived UI state that survives reconnect |
| Per-call lifecycles with cancellation | Cross-cutting fire-and-forget signals | Diff-based sync between clients |
| Replay on reconnect | | |

For chat-style UIs that combine both: keep the **conversation log** in shared state (survives reconnects), and use a streaming channel for **active responses**. The action that starts a response appends a placeholder to shared state; on producer close, commit the joined content back to shared state. Working example: [`examples/streaming-chat`](https://github.com/devframes/devframe/tree/main/examples/streaming-chat).

## Mounting into a host (Vite DevTools example)

A portable devframe can be mounted into any host that ships an adapter for it. Vite DevTools is one supported target — `createPluginFromDevframe` is the Vite-DevTools-specific bridge; other hosts can implement equivalent factories. Example:

```ts
// vite.config.ts
import { createPluginFromDevframe } from '@vitejs/devtools-kit/node'
import myInspector from './my-inspector'

export default {
  plugins: [
    createPluginFromDevframe(myInspector, {
      // Optional kit-only setup — runs after the auto-derived dock entry.
      setup(kitCtx) {
        kitCtx.commands.register({
          id: 'my-inspector:clear-cache',
          title: 'Clear Cache',
          handler: () => { /* ... */ },
        })
      },
    }),
  ],
}
```

The kit auto-derives an iframe dock entry from `id` / `name` / `icon` / `basePath`. For dock variations (custom-render, launcher, action, json-render), terminals, palette commands, and toasts, use the `options.setup` hook — those APIs live on the host-augmented context, not on the devframe-level `setup`. See the [`vite-devtools-kit` skill](../../skills/vite-devtools-kit) for the Vite-DevTools-specific reference.

## When clauses

Gate kit-side dock / command visibility with VS Code-style expressions. The runtime + types ship bundled from `devframe/utils/when` — no separate install. The consumers (`when` field on docks and commands) live in the kit:

```ts
when: 'clientType == embedded'
when: 'dockOpen && !paletteOpen'
when: 'my-inspector.ready && count >= 10'
```

Built-in context: `clientType` (`'embedded' | 'standalone'`), `dockOpen`, `paletteOpen`, `dockSelectedId`. Plugins can add namespaced keys (`.` or `:` separators). Both the types (`WhenExpression<Ctx, S>`) and runtime (`evaluateWhen`, `resolveContextValue`) come from `devframe/utils/when`.

## Agent-native surface (experimental)

Opt an RPC function into the agent surface with an `agent` field — default-deny otherwise. Agent-exposed functions **must declare `jsonSerializable: true`** (registration throws `DF0019` otherwise):

```ts
defineRpcFunction({
  name: 'my-inspector:get-stats',
  type: 'query',
  jsonSerializable: true,
  args: [v.object({ limit: v.number() })],
  returns: v.object({ count: v.number() }),
  agent: {
    description: 'Return the top-N module stats. Safe to call freely.',
    // safety inferred from type: 'query' → 'read'
  },
  setup: () => ({ handler: async ({ limit }) => ({ count: limit }) }),
})
```

Or register tools / resources directly:

```ts
ctx.agent.registerTool({
  id: 'my-inspector:summarize',
  description: 'Plain-text summary of the current scan.',
  safety: 'read',
  handler: async () => ({ markdown: buildSummary() }),
})

ctx.agent.registerResource({
  id: 'current-scan',
  name: 'Current scan',
  mimeType: 'text/markdown',
  read: () => ({ text: renderMarkdown(currentScan) }),
})
```

Expose via MCP:

```ts
import { createMcpServer } from 'devframe/adapters/mcp'

await createMcpServer(devframe, { transport: 'stdio' })
```

`@modelcontextprotocol/sdk` is a peer dependency. The CLI adapter also exposes `my-devframe mcp` — route host logs to stderr (stdout is the MCP transport). Safety classifications (`'read' | 'action' | 'destructive'`) drive MCP hint annotations that agent clients use to prompt for confirmation.

## Author SPA

Authors bring their own SPA (any framework or plain HTML). Client entry:

```ts
import { connectDevframe } from 'devframe/client'

const rpc = await connectDevframe()
// await rpc.ensureTrusted() // WS mode only — blocks until server accepts

const data = await rpc.call('my-inspector:get-stats', { limit: 10 })
```

`connectDevframe` auto-detects the backend via `/.devtools/.connection.json`:

- **websocket** (dev mode) — full read/write, requires auth handshake. Listen for token updates on the `vite-devtools-auth` BroadcastChannel.
- **static** (build / spa output) — read-only, resolves calls from the baked RPC dump.

Use `rpc.sharedState.get(key)` for observable state, `rpc.client.register(defineRpcFunction(...))` to receive server broadcasts, and `rpc.callOptional(...)` when a missing handler should resolve to `undefined` instead of throwing.

## Build dumps

`createBuild` bakes `static` function results automatically. For `query` functions, supply `dump` (or `snapshot: true` for the no-args sugar):

```ts
defineRpcFunction({
  name: 'my-inspector:get-session',
  type: 'query',
  setup: () => ({
    handler: async (id: string) => loadSession(id),
    dump: {
      inputs: [['session-a'], ['session-b']],
      fallback: { id: 'unknown', data: null },
    },
  }),
})
```

At runtime, static clients look up the argument hash in the dump; misses resolve to `fallback` (or throw if absent).

## CLI adapter subcommands

`createCli(devframe).parse()` gives the tool four subcommands out of the box:

| Subcommand | Action |
|------------|--------|
| *(default)* | Dev server on port 9999 (or `--port`) — WebSocket RPC, `cli.distDir` served at `/.devtools/` |
| `build` | Static snapshot → `./dist-static/` (configurable via `--out-dir`) |
| `spa` | Deployable SPA → `./dist-spa/` |
| `mcp` | stdio MCP server (experimental) |

**Bring your own CLI framework?** `createCli` is just a cac wrapper around three peer factories — `createDevServer` (`devframe/adapters/dev`), `createBuild` (`devframe/adapters/build`), and `createMcpServer` (`devframe/adapters/mcp`). Use them directly with commander/yargs/oclif when `createCli`'s baked-in command structure doesn't fit. `createDevServer` returns a `StartedServer` handle (`origin`, `port`, `app`, `wss`, `close()`) so you can wire SIGINT / hot-reload teardown into the surrounding program. `parseCliFlags(schema, raw)` and `defineCliFlags(...)` (both from `devframe/adapters/cli`) validate an arbitrary flag bag against a `CliFlagsSchema` — typed flags aren't tied to cac.

## Bundled utilities

Devframe re-exports a curated set of helpers under `devframe/utils/*`. They are bundled — never add the underlying packages to a devtool's own `package.json`:

| Import | Wraps | Use for |
|--------|-------|---------|
| `colors` from `devframe/utils/colors` | `ansis` | Terminal ANSI colors (`c.red`, `c.green`, tagged templates) |
| `open` from `devframe/utils/open` | `open` | Open URLs / files in the OS default handler |
| `launchEditor` from `devframe/utils/launch-editor` | `launch-editor` | Open `file:line:column` in the user's editor (optional `editor` arg) |
| `hash` from `devframe/utils/hash` | `ohash` | Stable structural hash — cache keys, dedup |
| `structuredClone{Serialize,Deserialize,Stringify,Parse}` from `devframe/utils/structured-clone` | `structured-clone-es` | JSON-safe round-trip of `Map` / `Set` / `Date` / `BigInt` / cycles |
| `humanId` from `devframe/utils/human-id` | `human-id` | Human-readable IDs (`bright-orange-tiger`) |
| `nanoid` from `devframe/utils/nanoid` | (vendored) | URL-safe random IDs |
| `promiseWithResolver` from `devframe/utils/promise` | — | Externally-controlled `Promise` |
| `createEventEmitter` from `devframe/utils/events` | — | Typed event bus |
| `createSharedState` from `devframe/utils/shared-state` | (immer internal) | Immutable state container (see `ctx.rpc.sharedState`) |
| `createStreamSink` / `createStreamReader` from `devframe/utils/streaming-channel` | — | Low-level streaming primitives |
| `evaluateWhen` / `WhenExpression` from `devframe/utils/when` | `whenexpr` | When-clause expressions |

For "open file in editor" + "reveal in finder", prefer the prebuilt `openHelpers` RPC recipe — it wires the two utilities into named RPC functions ready to register.

## Testing

- Unit-test host classes with fake contexts.
- Run `templates/counter-devframe.ts` under each adapter for integration coverage.
- Snapshot the build-static RPC dump (`<outDir>/.devtools/.rpc-dump/index.json`) to catch accidental drift in `static` function outputs.

## Further reading

Devframe-level pages (one-tool, portable surface):

- [Devframe Definition](https://devfra.me/devframe-definition) — fields, runtime flags, multi-adapter wiring
- [Adapters](https://devfra.me/adapters) — full reference for all deployment adapters
- [RPC](https://devfra.me/rpc) — types, schema, broadcasts, dumps
- [Shared State](https://devfra.me/shared-state) — patches, events, client-side mutation
- [Streaming](https://devfra.me/streaming) — chunked feeds, uploads, replay, Web/Node Streams interop
- [When Clauses](https://devfra.me/when-clauses) — syntax, context, type-safe wrappers
- [Structured Diagnostics](https://devfra.me/diagnostics) — coded errors via `ctx.diagnostics`, register custom codes
- [Utilities](https://devfra.me/utilities) — bundled `devframe/utils/*` helpers (colors, hash, launchEditor, structured-clone, …)
- [Client](https://devfra.me/client) — auth handshake, modes, discovery
- [Agent-Native](https://devfra.me/agent-native) — agent field, tools/resources, MCP + Claude Desktop

Host-specific extras (when mounting into Vite DevTools — other hosts have their own equivalents):

- [Vite DevTools Kit overview](https://devtools.vite.dev/kit/)
- [Dock System](https://devtools.vite.dev/kit/dock-system) — every entry type + remote docks
- [Commands](https://devtools.vite.dev/kit/commands) — palette, keybindings, sub-commands
- [Messages & Notifications](https://devtools.vite.dev/kit/messages) — entry fields, positional hints
- [Terminals](https://devtools.vite.dev/kit/terminals) — child processes, external sessions
