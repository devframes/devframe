---
name: devframe
description: >
  Use when building a devtool with devframe - the framework- and
  build-tool-agnostic foundation for defining a devtool once and
  serving it anywhere. Covers the DevframeDefinition, the standard
  web handler (`initDevframe` → `handler` / `nodeMiddleware`) that
  mounts a tool into any host framework, the packaging adapters (cli /
  build / dev / mcp / embedded), the framework kits (`@devframes/vite`,
  `@devframes/next`, `@devframes/nuxt`, each split into `single` and
  `hub`), composing many tools into one hub with
  `@devframes/hub` (`initHub`, docks / commands / messages /
  terminals), designing RPC contracts, exposing an agent-native
  API over MCP, and wiring the author's SPA. Triggers on
  `devframe` imports, `defineDevframe`, `initDevframe`, `initHub`,
  `createCac`, `createMcpServer`, `connectDevframe`, `@devframes/*`
  imports, and on migrations of existing inspectors
  (eslint-config-inspector, unocss-inspector,
  node-modules-inspector-style tools) onto devframe.
---

# devframe skill

**Devframe is the `unplugin` for devtools: define a tool once, mount it anywhere.** A devtool built on devframe is a single `DevframeDefinition` plus an author-provided SPA. That definition describes one tool - its RPC, shared state, diagnostics, web interface, and agent-facing API - independent of how it is presented. The same definition then deploys through a standard web handler, a set of packaging adapters, thin framework kits, or composed with other tools inside a hub.

Two layers, one boundary:

- **A devframe** is one portable tool. `initDevframe(def, { base })` turns it into a live instance whose `.handler` is a Web-Standard `(request: Request) => Promise<Response>` carrying the whole devframe (SPA, discovery, WebSocket RPC, auth gate, optional MCP route) under one mount base. Anything that can mount a catch-all route or Connect-style middleware can serve it.
- **A hub** (`@devframes/hub`) composes *many* devframes behind one namespace with a shared RPC registry, one transport, one auth gate, and the orchestration features that only make sense when tools share a UI (docks, commands, messages, terminals). `initHub()` puts the whole collection behind the same kind of standard handler.

Devframe is framework- and build-tool-agnostic - it has zero dependency on Vite or any `@vitejs/*` package and makes no UI-framework assumption. [Vite DevTools](https://devtools.vite.dev/) is the first flagship hub UI provider built on it; the built-in devframes deliberately span Vue, Svelte, Solid, React, and Next to prove the point.

High-level concept: [Pluggable, Extensible, and Playful DevTools](https://antfu.me/posts/pluggable-extensible-playful-devtools). Full reference: [devfra.me](https://devfra.me/).

## Deployment map — pick by how it's served, not by what it does

The same `DevframeDefinition` runs under every one of these. Choose based on where the tool needs to live.

**Serve one devframe:**

| Goal | Entry | Import |
|------|-------|--------|
| Mount into any host framework (the portability primitive) | `initDevframe(def, { base })` → `.handler` / `.nodeMiddleware` | `devframe/initiate` |
| Standalone CLI (dev / build / mcp subcommands) | `createCac(def, opts?).parse()` | `devframe/adapters/cac` |
| Programmatic dev server | `createDevServer(def, opts?)` | `devframe/adapters/dev` |
| Self-contained static deploy with baked data | `createBuild(def, opts?)` | `devframe/adapters/build` |
| MCP server for coding agents | `createMcpServer(def, opts?)` | `devframe/adapters/mcp` |
| Runtime registration into an existing context | `createEmbedded(def, { ctx })` | `devframe/adapters/embedded` |
| Ride along a Vite dev server (no dock) | `devframeVitePlugin` / `devframeViteBridge` / `devframeVite` | `@devframes/vite/single` |
| Author one devframe's SPA with Next | `withDevframe` + `createDevframeNextHandler` | `@devframes/next/single` |
| Author one devframe's SPA with Nuxt | Nuxt module | `@devframes/nuxt/single` |
| Mount into the Vite DevTools dock | `createPluginFromDevframe(def, opts?)` | `@vitejs/devtools-kit/node` |

**Serve many devframes as a hub:**

| Goal | Entry | Import |
|------|-------|--------|
| Compose a hub behind one handler | `initHub({ base, devframes, ui })` | `@devframes/hub/initiate` |
| Imperatively mount into a hub context | `createHubContext(...)` → `ctx.install(def)` | `@devframes/hub/node` |
| Reference hub UI provider | `createUi(opts?)` | `@devframes/hub-ui` |
| Mount a hub inside Vite / Next / Nuxt | `viteDevframeHub` / `nextDevframeHub` / hub module | `@devframes/{vite,next,nuxt}/hub` |

`createCac`, `createDevServer`, the `@devframes/vite` bridge, and `@devframes/next` are all assembled from `initDevframe` internally - the standard handler is the one wiring underneath every serving path.

## Minimum viable devframe

```ts
import { defineDevframe, defineRpcFunction } from 'devframe'
import pkg from '../package.json' with { type: 'json' }

export default defineDevframe({
  id: 'my-inspector',
  name: 'My Inspector', // display label — distinct from packageName
  version: pkg.version,
  packageName: pkg.name,
  importMetaUrl: import.meta.url, // resolution base for the tool's own deps (assets, services)
  homepage: pkg.homepage,
  description: pkg.description,
  icon: 'ph:magnifying-glass-duotone',
  clientAssets: './client/dist', // built SPA served as the UI
  setup(ctx) {
    const my = ctx.scope('my-inspector') // preferred — auto-namespaces ids
    my.rpc.register(defineRpcFunction({
      name: 'get-stats', // stored as `my-inspector:get-stats`
      type: 'static',
      handler: () => ({ count: 42 }),
    }))
  },
})
```

Source `version` / `packageName` / `homepage` / `description` from your published `package.json` (the JSON import-attribute form resolves under both bundlers and Node's native TypeScript execution). Always pass `importMetaUrl: import.meta.url` - it is the base the node side resolves the tool's own companion packages against (a `--assets` package holding the built SPA, a wire-service package), so a devframe ships them as its own dependencies and users install nothing extra.

`setup(ctx, info?)` runs in **every** runtime and does all devframe-level wiring: RPC functions, shared state, streaming channels, diagnostics, the agent-facing API. Its optional second argument carries runtime metadata (most notably parsed CLI `flags` under `createCac`). Gate per-runtime work on `ctx.mode` (`'dev'` | `'build'`).

**A built-in devframe's default export is its `create<X>Devframe` factory, never a pre-built instance** - `export default createMyInspectorDevframe`, so importing the module costs nothing and each consumer calls the factory (with or without options) to get its own instance.

See `templates/counter-devframe.ts` for a runnable example, `templates/hub.ts` for composing a hub, and `templates/vite-client.ts` for the author's browser entry.

## The standard handler (`initDevframe`)

This is the portability trick and the thing to reach for whenever a host framework can mount a route. `base` is required, so the mount path is explicit at the call site.

```ts
import { initDevframe } from 'devframe/initiate'
import myDevframe from './my-tool'

const devtools = initDevframe(myDevframe, { base: '/__my-tool/' })
// devtools.base, .handler, .nodeMiddleware, .attach, .handleUpgrade,
// .ready, .context, .connectionMeta(), .close()
```

Mount `.handler` (Web-Standard) or `.nodeMiddleware` (Connect-style) on a catch-all route:

```ts
// Hono — `serve()` returns the node server the socket rides on
app.all('/__my-tool/*', c => devtools.handler(c.req.raw))
devtools.attach(serve({ fetch: app.fetch, port: 3000 }))

// Vite — connect middleware + Vite's own server for the socket
server.middlewares.use(initDevframe(myDevframe, {
  base: '/__my-tool/',
  server: server.httpServer ?? undefined,
}).nodeMiddleware)
```

`devtools.base` is the normalized mount base - reference it in route guards instead of repeating the string.

**The WebSocket binding** is the host framework's explicit call. Fetch handlers only hand over `Request`s, so the RPC socket needs its own binding, resolved in precedence order:

1. `ws.port` — a side-car on that exact port.
2. `server` — share the host framework's `node:http` server; the upgrade binds at `<base>__ws`. Zero extra ports, follows the user app through proxies/HTTPS.
3. `ws: { sidecar: true }` — a side-car on a free port, for host frameworks whose handlers never see upgrades (Next.js route handlers, Nitro, SvelteKit, Rsbuild).
4. **The host framework's own upgrades** — with none of the above, `devtools.attach(server)` routes a `node:http` server's `upgrade` events (returns a detach fn) and `devtools.handleUpgrade(req, socket, head)` completes a single one. Built lazily — an instance nobody attaches costs nothing.

`ws.url` instead controls the *advertisement* (the tunnel/external-transport pattern). Whichever is active, `__connection.json` describes it and the RPC client follows.

Host frameworks that re-evaluate modules in dev (Next, Nitro, SvelteKit) must memoize the instance on `globalThis`, or every reload leaks the previous WebSocket server. The framework kits do this for you.

**Auth gates by default** - a handler mounted inside the user app's server is reachable by anything that can open its socket. The interactive OTP handler is wired automatically and prints its code / magic-link once the public origin is known. Pass `auth: false` only for a single-user localhost setup, or a `DevframeAuthHandler` for a custom scheme.

## Scoped context (preferred)

`ctx.scope(id)` (node side) and `client.scope(id)` (browser side) return a namespace-scoped view that auto-prefixes every RPC id, shared-state key, and streaming channel with `id:`, and adds a top-level persisted `settings` store. Prefer it over the raw `ctx.rpc` / RPC client - name the namespace once, register and call by bare name.

```ts
// node side — setup(ctx)
const my = ctx.scope('my-inspector')
my.rpc.register(getStats) //               -> my-inspector:get-stats
await my.rpc.call('get-stats') //          invokeLocal, namespaced
const state = await my.rpc.sharedState('view') // -> my-inspector:view
await my.settings.project.set('theme', 'dark')

// browser side — connectDevframe()
const my = (await connectDevframe()).scope('my-inspector')
const stats = await my.rpc.call('get-stats')
```

- **Auto-namespacing.** Bare names get `id:` prepended; a name already containing `:` is treated as fully-qualified and passed through (so `my.rpc.call('other-tool:fn')` works). `register` only accepts bare names - a namespaced one throws `DF0034`.
- **Typed bare calls.** Define functions with bare names and augment the registry with `RpcDefinitionsToFunctionsWithNamespace<'my-inspector', typeof serverFunctions>` so registry keys match the namespaced runtime ids; scoped `call('get-stats')` then stays typed.
- **`base`.** The scoped context keeps the raw context as `my.base` (and re-exposes `views` / `diagnostics` / `agent` / `services` / `host` / `cwd` / `mode` on the node side).

### Settings

`my.settings` is a persisted key-value store at the **top level** of the scoped context (a sibling of `my.rpc`). Two scopes: `project` (per-checkout) and `global` (per-user). Both are file-backed on the node side and synced to RPC clients over the shared-state protocol, so a `set` on either side propagates everywhere and survives restarts. All methods are async.

```ts
await my.settings.project.set('theme', 'dark')
await my.settings.project.get('theme') // 'dark'
await my.settings.global.all()
const off = await my.settings.global.onChange(value => apply(value))
```

Type a namespace's settings by augmenting `DevframeSettingsRegistry`:

```ts
declare module 'devframe' {
  interface DevframeSettingsRegistry {
    'my-inspector': { theme: 'light' | 'dark', recentFiles: string[] }
  }
}
```

## DevframeNodeContext at a glance

`setup(ctx)` receives the framework-neutral node-side API:

| Member | Purpose |
|------|---------|
| `ctx.scope(id)` | **Preferred** namespace-scoped view — auto-prefixed `rpc` + top-level `settings` store |
| `ctx.rpc` | Register RPC functions, broadcast, shared state, streaming channels |
| `ctx.views` | Serve static files via `hostStatic(base, distDir)` |
| `ctx.diagnostics` | Structured diagnostics host (nostics) — register custom error codes |
| `ctx.agent` | Expose tools + resources to coding agents |
| `ctx.services` | Typed cross-devframe service registry (`provide` / `whenAvailable`) |
| `ctx.staticConfig` | This context's own `ConnectionMeta.configs` — boot-time, read-only-from-browser data |
| `ctx.host` | Runtime abstraction — `mountStatic`, `resolveOrigin`, `getStorageDir` |
| `ctx.mode` | `'dev'` or `'build'` — gate setup work per runtime |

> Hub adapters augment `ctx` with extra subsystems (`docks`, `terminals`, `messages`, `commands`) — see [The Hub](#the-hub). The Vite DevTools kit exposes the same subsystems via an optional `setup` hook.

**Storage scopes** — `ctx.host.getStorageDir(scope)` places persisted state in one of three classes:

| Scope | Placement | For |
|-------|-----------|-----|
| `workspace` | committable, `<workspaceRoot>/.devframe/` | team-shared presets, shared config |
| `project` | per-checkout, `<cwd>/node_modules/.<app>/devframe/` | caches, personal settings |
| `global` | per-user, `~/.<app>/devframe/` | auth tokens, machine-wide prefs |

Scoped settings persist their `project` scope through `project` storage and their `global` scope through `global`.

## Project layout

Once a devframe grows past a couple of RPC functions, split them out - one file per function under `src/rpc/functions/`, with `src/rpc/index.ts` as the barrel that collects them into `const serverFunctions = [...] as const` and feeds the type-safe RPC client registry via `RpcDefinitionsToFunctionsWithNamespace<'my-tool', typeof serverFunctions>`.

```ts
// src/rpc/functions/list-files.ts
import { defineRpcFunction } from 'devframe'
import { getMyToolContext } from '../../context'

export const listFiles = defineRpcFunction({
  name: 'list-files', // bare — the scope namespaces it to `my-tool:list-files`
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
  interface DevframeRpcServerFunctions
    extends import('devframe/rpc').RpcDefinitionsToFunctionsWithNamespace<'my-tool', typeof serverFunctions> {}
}
```

```ts
// src/my-tool.ts
import { defineDevframe } from 'devframe'
import pkg from '../package.json' with { type: 'json' }
import { setMyToolContext } from './context'
import { serverFunctions } from './rpc'

export default defineDevframe({
  id: 'my-tool',
  name: 'My Tool',
  version: pkg.version,
  packageName: pkg.name,
  importMetaUrl: import.meta.url,
  homepage: pkg.homepage,
  description: pkg.description,
  setup(ctx) {
    const my = ctx.scope('my-tool')
    setMyToolContext(ctx, { loaders: createLoaders() })
    serverFunctions.forEach(fn => my.rpc.register(fn))
  },
})
```

### Sharing setup-time state via `src/context.ts`

When per-file RPCs need runtime values `setup(ctx)` constructs once - channels, shared-state handles, watchers, loaders, caches - expose them through a `WeakMap<DevframeNodeContext, T>` in a sibling `src/context.ts`. The WeakMap keys off the existing `DevframeNodeContext` so contexts are GC'd automatically when the host framework tears down.

```ts
// src/context.ts
import type { DevframeNodeContext } from 'devframe'

const map = new WeakMap<DevframeNodeContext, MyToolContext>()

export function setMyToolContext(ctx: DevframeNodeContext, value: MyToolContext): void {
  map.set(ctx, value)
}

export function getMyToolContext(ctx: DevframeNodeContext): MyToolContext {
  const value = map.get(ctx)
  if (!value)
    throw new Error('my-tool context not initialised — call setMyToolContext in devframe.setup')
  return value
}
```

Note `setMyToolContext(ctx, …)` keys off the raw `ctx` (the same object `setup(ctx)` receives), while registration goes through `my.rpc`. Stateless RPCs and tiny demos can keep the inline shorthand inside `setup(ctx)`.

## Namespacing

**Always prefix** RPC names, dock IDs, command IDs, shared-state keys, and agent tool IDs with the devframe `id` - a hub may mount many tools side by side.

```ts
'my-inspector:get-modules' // ✓
'get-modules' // ✗ — may collide with other devframes sharing the hub
```

A [scoped context](#scoped-context-preferred) applies this prefix for RPC / shared-state / streaming. Dock and command IDs are hub-level (not part of the scoped `rpc` API) - prefix those by hand.

## RPC contracts

Built on [birpc](https://github.com/antfu/birpc), validated at runtime against any [Standard Schema](https://standardschema.dev/) validator (valibot, zod, arktype, …). Devframe forces no validator - install whichever you prefer. First-party `@devframes/*` code stays validator-neutral and uses the built-in zero-dep `devframe/utils/simple-schema` builder; for your own tool, valibot is the lightest default, or reuse zod if you already ship it.

```ts
import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'

const getModules = defineRpcFunction({
  name: 'get-modules', // bare — registered via `ctx.scope('my-inspector').rpc.register`
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
| `'action'` | Node-side state mutation | Never | Never |
| `'event'`  | Fire-and-forget; no response | Never | Never |

Declared `args` / `returns` schemas are **enforced at runtime** - a failing call is rejected with `DF0043` / `DF0044`. Prefer a **single object arg** (`args: [v.object({ ... })]`) over positional args - property names self-document and agents rely on them.

### `jsonSerializable` (wire + dump format)

| Value | Encoder | Wire prefix | Round-trips |
|-------|---------|-------------|-------------|
| `false` (default) | `structured-clone-es` | `s:` | `Map`, `Set`, `Date`, `BigInt`, cycles, class instances |
| `true` (opt-in) | strict `JSON.stringify` | _(unprefixed)_ | JSON-only |

Set `jsonSerializable: true` when your handler returns plain JSON - the strict serializer **throws `DF0020`** synchronously on the offending call when a value can't round-trip through JSON, surfacing next to the call in dev. `agent: {...}` requires `jsonSerializable: true` (registration throws `DF0019` otherwise) - MCP tools speak JSON.

Through the scope, `my.rpc.broadcast({ method, args, optional?, event?, filter? })` pushes to every connected RPC client (method name namespaced), and `my.rpc.call(name, ...args)` invokes a node-side function locally without transport (the scoped form of `ctx.rpc.invokeLocal`, for cross-function composition).

## Shared state

```ts
const my = ctx.scope('my-inspector')
const state = await my.rpc.sharedState('state', { // -> my-inspector:state
  initialValue: { count: 0, items: [] as string[] },
})

state.mutate((draft) => {
  draft.count += 1
  draft.items.push('tick')
})
```

- Values must be serializable — no functions, no circular refs.
- Mutations round-trip to every RPC client; the node side tracks `syncIds` to avoid replay loops.
- Prefer shared state over ad-hoc RPC events for UI that must reappear after reconnect.

## Streaming channels

For chunk-style data in either direction - LLM deltas, log tails, build progress, uploads - use a streaming channel instead of inventing `action + delta/end` events.

```ts
const my = ctx.scope('my-inspector')
const channel = my.rpc.streaming.create<string>('tokens', { // -> my-inspector:tokens
  replayWindow: 256, // node side keeps last N chunks per stream id
  closedStreamRetention: 30_000, // ms to hold finished streams for late subscribers
})

// Node side — typically inside an action handler that returns the stream id
const stream = channel.start({ id: 'optional-stream-id' })
stream.write(token) // imperative
stream.close() // terminal success; stream.error(err) for terminal failure
stream.signal // AbortSignal — flips when consumers cancel or all subscribers drop
await channel.pipeFrom(sourceReadable) // start + pipe in one call

// Browser side — my = (await connectDevframe()).scope('my-inspector')
const reader = my.rpc.streaming.subscribe<string>('tokens', streamId)
for await (const token of reader) renderToken(token)
reader.cancel() // node-side `stream.signal` aborts
```

The same channel exposes `openInbound()` — the node-side half of an upload from the browser side; pair it with an action that returns the id, and the RPC client drives `my.rpc.streaming.upload<T>('files', uploadId)`. Web Streams are the canonical API (Node 17+ ships `Readable.fromWeb` / `Writable.fromWeb` converters). Producers should poll `stream.signal.aborted` and exit cooperatively.

**Streaming vs events vs shared state:** streaming for token/chunk feeds, uploads, per-call lifecycles with cancellation, and replay-on-reconnect; `event`-typed RPC for payload-free notifications and fire-and-forget signals; shared state for long-lived UI that survives reconnect. For chat UIs, keep the conversation log in shared state and stream active responses - working example: [`examples/streaming-chat`](https://github.com/devframes/devframe/tree/main/examples/streaming-chat).

## Agent-native API

Once a tool has a structured boundary, its visual panel is no longer the only interface: the same internal state and capabilities are consumable programmatically by coding agents, sharing one source of truth. RPC functions stay **private by default** and explicitly opt into agent exposure with an `agent` field. Agent-exposed functions must declare `jsonSerializable: true`.

```ts
defineRpcFunction({
  name: 'get-stats',
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

Or register tools / resources directly on `ctx.agent.registerTool({ id, description, safety, handler })` and `ctx.agent.registerResource({ id, name, mimeType, read })`. Expose the API over MCP:

```ts
import { createMcpServer } from 'devframe/adapters/mcp'

await createMcpServer(myDevframe, { transport: 'stdio' })
```

`@modelcontextprotocol/server` is a peer dependency. The CLI adapter also exposes `my-tool mcp` (route node-side logs to stderr - stdout is the transport). Safety classifications (`'read' | 'action' | 'destructive'`) drive MCP hint annotations that coding agents use to prompt for confirmation. In a hub, `ctx.commands` entries opt into the same agent-facing API with an `agent` field and reach MCP through the aggregate endpoint.

## Author SPA

Authors bring their own SPA (any framework or plain HTML). The browser-side code is **byte-identical** whether the tool runs standalone, embedded, or inside a hub - that is the portability promise.

```ts
import { connectDevframe } from 'devframe/client'

const client = await connectDevframe()
const my = client.scope('my-inspector') // preferred — namespaced calls
const data = await my.rpc.call('get-stats', { limit: 10 })
```

`connectDevframe` auto-detects the backend via `./__connection.json`, resolved relative to the executing script's runtime base (so the SPA never hardcodes its mount path - build with `vite.base: './'`):

- **websocket** (dev mode) — full read/write, requires the auth handshake. `await client.ensureTrusted()` blocks until the node side accepts; listen for token updates on the `devframe-auth` BroadcastChannel.
- **static** (build output) — read-only, resolves calls from the baked RPC dump.

Use `my.rpc.sharedState(key)` for observable state, `my.rpc.register(...)` to receive broadcasts from the node side, `my.rpc.callOptional(...)` when a missing handler should resolve to `undefined`, and `my.settings.{project,global}` for persisted settings synced from the node side.

### In-page channel (page script ↔ panel, server-free)

For a live inspect-the-page loop, `devframe/in-page-channel` connects a devframe's **page script** (in the user app's page) to its **panels** entirely in the browser — no server, so it works identically in dev and static builds. Declare one shared protocol type; the page script is `createPageScriptChannel<P>({ name, functions })`, each panel `connectPanelChannel<P>({ name })`. Functions use `defineChannelFunction` (the `defineRpcFunction` shape: `type: 'event'` fans out to every panel, `query`/`action` are request/response); `channel.sharedState.get(key)` mirrors `rpc.sharedState` with the page script as authority (panels get automatic replay). The handshake is panel-initiated with retry — boot order and reloads don't matter — and panels expose `status`/`whenConnected(ms)` for "page script not loaded" fallbacks. Channel names follow `devframes:plugin:<slug>`. The a11y inspector's scan/highlight loop is the reference use.

## The Hub

A single devframe is one portable tool; a hub is where many tools **meet and collaborate**. `@devframes/hub` is the framework-neutral composition layer. It adds the orchestration subsystems that only make sense when tools share a UI, and it ships no UI of its own - a hub UI provider fills the `ui` slot.

`initHub()` puts the whole collection behind one standard handler with the same API and mount snippets as `initDevframe`:

```ts
import { createUi } from '@devframes/hub-ui'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import createInspectDevframe from '@devframes/plugin-inspect'
import createTerminalsDevframe from '@devframes/plugin-terminals'

export const hub = initHub({
  base: DEVFRAMES_HUB_BASE, // required — the conventional `/__devframes/`
  devframes: [createInspectDevframe(), createTerminalsDevframe()],
  ui: createUi(), // reference hub UI provider + floating dock; `ui: false` for headless
  configure(ctx) {
    ctx.commands.register({ id: 'app:hello', title: 'Hello', handler: () => 'hi' })
  },
})

hub.handler // the whole devtools ecosystem as Request -> Response
```

Every mounted devframe runs its `setup()` against **one shared hub context**: a merged RPC registry (mounted devframes can call each other's functions), one shared-state store, one WebSocket transport, and one auth gate. Devframe ids become URL segments (`<base><id>/`) and are validated (reserved → `DF8000`, non-route-safe → `DF8004`).

### Hub subsystems

A hub-aware `DevframeHubContext` extends `DevframeNodeContext` with four subsystems:

| Subsystem | API | Purpose |
|-----------|---------|---------|
| `ctx.docks` | `register / update / values / activate` | Dock entries (iframe, launcher, custom-render, group, and opt-in types) and cross-iframe activation. |
| `ctx.terminals` | `register / startChildProcess` | Aggregate terminal sessions, stream output over a well-known channel. |
| `ctx.messages` | `add / update / remove / clear` | Node-side toast/notification queue (FIFO, capped 1000). |
| `ctx.commands` | `register / execute / list` | Hierarchical command palette with keybindings and `when` clauses. |

The dock union is **open** - opt-in packages contribute their own entry types (e.g. JSON-Render adds a `json-render` dock type with no JSON-render dependency in the hub). `ctx.docks.activate(dockId, params?)` steers which dock entry the hub UI provider shows; from a mounted iframe, `rpc.call('hub:docks:activate', { dockId, params })` does the same cross-iframe. A `type: 'launcher'` dock binds a command, streams a `digest` line, and jumps to its terminal session - the pattern that lets an analyzer spawn `vite build` and navigate the user to its output.

### Mounting into a hub

`ctx.install(def)` is the framework-neutral primitive - it registers any `DevframeDefinition` as a dock and runs its `setup(ctx)` - and the imperative counterpart to `initHub`'s declarative `devframes` list:

```ts
import { createHubContext } from '@devframes/hub/node'

const ctx = await createHubContext({ cwd, host, mode: 'dev' })
await ctx.install(myDevframe)
```

When a devframe sharing an already-mounted `id` is installed, its `duplicationStrategy` (`'warn'` default / `'silent'` / `'throw'` / `'duplicate'`) decides the outcome.

### The protocol — what a hub UI provider sees

A hub UI provider imports no hub classes; it reads shared-state keys and one RPC method:

| Channel | Type | Carries |
|---------|------|---------|
| `devframe:docks` (shared state) | `DevframeDockEntry[]` | Every registered dock entry. |
| `devframe:commands` (shared state) | `DevframeServerCommandEntry[]` | Serializable command list (handlers stripped). |
| `devframe:docks:active` (shared state) | `DevframeDocksActiveState` | Most recent dock-activation request. |
| `hub:commands:execute` (RPC) | `(id, ...args) => unknown` | Node-side command dispatch. |
| `hub:docks:activate` (RPC) | `({ dockId, params? }) => void` | Switch the active dock from any RPC client. |

Plus broadcasts (`devframe:docks:activate`, `devframe:terminals:updated`, `devframe:messages:updated`). The hub also ships a headless client runtime, `createDevframeClientRuntime()` from `@devframes/hub/client`: booted in the host page, it assembles the shared client context from this protocol and imports each dock entry's client script into that page - how a built-in devframe like the a11y inspector runs its page script inside the user app's page.

### The `ui` slot

The hub is headless; `DevframeHubUi` is pure data (`viewer` / `embedded` / `assets` / `setup`). `@devframes/hub-ui`'s `createUi()` is the reference hub UI provider - a standalone devtools page plus a floating dock injected via one `<script type="module" src="/__devframes/embedded.js">` tag. It takes `branding`, `dockPreferences`, and `embeddedVisibility` (`'normal'` / `'passive'` / `'hidden'`). Another hub UI provider supplies a different object to the same slot and reuses all the infrastructure. Renderer modules for opt-in dock types compose at the hub via `initHub({ renderers })`.

Two copyable reference hubs mount every built-in devframe behind an icon dock rail - the shape Vite DevTools wears, shrunk to the smallest thing you can build your own hub UI provider from: [`examples/hub-vite/`](https://github.com/devframes/devframe/tree/main/examples/hub-vite) (~120-line Vite host, vanilla DOM UI) and [`examples/hub-next/`](https://github.com/devframes/devframe/tree/main/examples/hub-next) (Next.js App Router). The `hub-*-minimal` family shows the default `createUi()` mount across Vite, Next, Nitro, Hono, Fastify, SvelteKit, Deno, and Rsbuild.

## Framework kits: two scopes

`@devframes/vite`, `@devframes/next`, and `@devframes/nuxt` each split into two clearly-scoped subpaths; the bare root import throws with a pointer to both.

- **`.../single`** — build & dev-serve one devframe's SPA with that tool.
  - Vite: `devframeVitePlugin` (static mount) / `devframeViteBridge` (RPC bridge) / `devframeVite` (wrapper), from `@devframes/vite/single`.
  - Next: `withDevframe` (config) + `createDevframeNextHandler` (route handler), plus a React client at `@devframes/next/single/client` (`RpcProvider`, `useRpc`, `useRpcStatus`).
  - Nuxt: `modules: ['@devframes/nuxt/single']`.
- **`.../hub`** — mount a whole `@devframes/hub` inside that tool. Wraps `initHub`, defaults the UI to `createUi()`, ships a browser client helper at `.../hub/client`.
  - `viteDevframeHub()` (shares Vite's server, injects the dock), `nextDevframeHub()` (side-car socket, App Router route), the Nuxt hub module.
  - `@devframes/hub` and `@devframes/hub-ui` are optional peers of these packages.

Vite and Nuxt already have native hub UI providers ([Vite DevTools](https://devtools.vite.dev/), [Nuxt DevTools](https://devtools.nuxt.com/)), so `@devframes/vite/hub` and `@devframes/nuxt/hub` print a one-time recommendation to prefer those (silence with `{ quiet: true }`); `@devframes/next/hub` has no native counterpart and stays quiet.

For Vite DevTools specifically, `createPluginFromDevframe(def, opts?)` from `@vitejs/devtools-kit/node` adapts a definition into the kit's plugin interface (`{ name, devtools: { setup, capabilities } }`), auto-deriving an iframe dock entry from `id` / `name` / `icon` / `basePath`. Pass `options.setup` for richer node-side behaviour (custom-render docks, terminals, palette commands) on the kit-augmented context. The factory lives in the kit, not devframe, so devframe stays free of any `@vitejs/*` dependency.

## When clauses

Gate dock / command visibility with VS Code-style expressions. The runtime + types ship bundled from `devframe/utils/when` - no separate install.

```ts
when: 'clientType == embedded'
when: 'dockOpen && !paletteOpen'
when: 'my-inspector.ready && count >= 10'
```

Built-in context: `clientType` (`'embedded' | 'standalone'`), `dockOpen`, `paletteOpen`, `dockSelectedId`. Devframes add namespaced keys (`.` or `:` separators). `when` clauses evaluate **browser-side only** and are not enforced for agent calls - only gate a command with `when` if running it outside its UI context is safe.

## CLI adapter subcommands

`createCac(myDevframe).parse()` gives three subcommands out of the box:

| Subcommand | Action |
|------------|--------|
| *(default)* | Dev server (port 9999 or `--port`) — WebSocket RPC, `clientAssets` served at the base |
| `build` | Static snapshot → `./dist-static/` (`--out-dir`) |
| `mcp` | stdio MCP server |

**Bring your own CLI framework?** `createCac` is a thin cac wrapper around three peer factories - `createDevServer` (`devframe/adapters/dev`), `createBuild` (`devframe/adapters/build`), `createMcpServer` (`devframe/adapters/mcp`). Use them directly with commander/yargs/oclif. `cac` is an optional peer pulled in only through `devframe/adapters/cac`. `createDevServer` returns a `StartedServer` handle (`origin`, `port`, `app`, `ws?`, `close()`) for SIGINT / hot-reload teardown. `parseCliFlags(schema, raw)` and `defineCliFlags(...)` validate an arbitrary flag bag.

## Build dumps

`createBuild` bakes `static` function results automatically. For `query` functions, supply `dump` (or `snapshot: true` for the no-args sugar):

```ts
defineRpcFunction({
  name: 'get-session',
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

At runtime, static RPC clients look up the argument hash in the dump; misses resolve to `fallback` (or throw if absent). To bake an RPC this devframe doesn't own (e.g. a wire service's), declare it under the definition's `rpc.snapshot`.

## Bundled utilities

Devframe re-exports a curated set of helpers under `devframe/utils/*`. They are bundled - never add the underlying packages to a devtool's own `package.json`:

| Import | Wraps | Use for |
|--------|-------|---------|
| `colors` from `devframe/utils/colors` | `ansis` | Terminal ANSI colors |
| `open` from `devframe/utils/open` | `open` | Open URLs / files in the OS handler |
| `launchEditor` from `devframe/utils/launch-editor` | `launch-editor` | Open `file:line:column` in the user's editor |
| `hash` from `devframe/utils/hash` | `ohash` | Stable structural hash — cache keys, dedup |
| `structuredClone{Serialize,Deserialize,Stringify,Parse}` from `devframe/utils/structured-clone` | `structured-clone-es` | JSON-safe round-trip of `Map`/`Set`/`Date`/`BigInt`/cycles |
| `nanoid` from `devframe/utils/nanoid` | (vendored) | URL-safe random IDs |
| `randomToken` / `randomDigits` / `timingSafeEqual` from `devframe/utils/crypto-token` | (native WebCrypto) | CSPRNG bearer tokens, one-time codes, constant-time compare |
| `createEventEmitter` from `devframe/utils/events` | — | Typed event bus |
| `createSharedState` from `devframe/utils/shared-state` | (immer internal) | Immutable state container |
| `s` from `devframe/utils/simple-schema` | — | Zero-dep Standard Schema builder (`s.object`, `s.string`, …) for validator-neutral first-party code |
| `evaluateWhen` / `WhenExpression` from `devframe/utils/when` | `whenexpr` | When-clause expressions |

For "open file in editor" + "reveal in finder", prefer the `@devframes/service-open` wire service (declare `services: [{ package: '@devframes/service-open' }]` on the definition, gate browser-side UI on `rpc.services.has(...)`) - one installation at the host framework shared by every devframe.

## Security (secure by default)

RPC handlers run with the full privileges of the host framework's process, so the boundary that matters is who may connect.

- **`auth` defaults to `true`** — dev-mode connections must authenticate before calls are accepted. In a **hub**, one gate at the one shared transport covers every mounted devframe, the hub built-ins, and the MCP route; mounted devframes have no gates of their own.
- **`auth: false` trusts every reachable connection.** Only for single-user `localhost` tools - never with a non-loopback bind host, a tunnel, or a shared/CI environment.
- **Authentication** exchanges a 6-digit one-time code (shown in the developer's terminal) for a node-issued bearer token. Single-use, expires in 5 min, constant-time compared, rotates after repeated failures.
- **Magic-link (optional):** the code rides the URL **fragment** (`#devframe_otp=<code>`), never sent to the node side; `connectDevframe` reads, exchanges, and strips it. Only the single-use code ever rides a URL, never the bearer.
- **Tokens are secrets.** Serve over `wss://` / `https://` beyond loopback. Never log or bake them into build output. Revoke via `revokeAuthToken(...)`.
- **Authorize handlers.** Any trusted RPC client can call any registered function - validate inputs, and mark state-changing functions `type: 'destructive'` so coding agents prompt first. `when` clauses are UI-only and not enforced for agent calls.
- **The MCP route requires an Origin** — the route-based MCP server rejects `Origin`-less requests, so it isn't reachable by an arbitrary local process.

See [Security](https://devfra.me/security) for the full reference.

## Testing

- Unit-test node-side classes with fake contexts.
- Run `templates/counter-devframe.ts` under each adapter for integration coverage.
- Snapshot the build-static RPC dump (`<outDir>/.devframe/.rpc-dump/index.json`) to catch drift in `static` function outputs.

## Further reading

Devframe-level (one portable tool):

- [Devframe Definition](https://devfra.me/guide/devframe-definition) — fields, `importMetaUrl`, runtime flags
- [Initiate (standard handler)](https://devfra.me/adapters/initiate) — `initDevframe`, mounting, the WebSocket binding
- [Scoped Context](https://devfra.me/guide/scoped-context) — `ctx.scope(id)`, auto-namespacing, `settings`
- [Adapters](https://devfra.me/adapters/) — cli / dev / build / mcp / embedded
- [RPC](https://devfra.me/guide/rpc) — types, Standard Schema, broadcasts, dumps
- [Shared State](https://devfra.me/guide/shared-state) · [Streaming](https://devfra.me/guide/streaming) · [When Clauses](https://devfra.me/references/when-clauses)
- [Diagnostics](https://devfra.me/guide/diagnostics) · [Services](https://devfra.me/guide/services) · [Client](https://devfra.me/guide/client)
- [Security](https://devfra.me/guide/security) · [Agent-Native](https://devfra.me/guide/agent-native)

Hub & frameworks (composing many tools):

- [Hub](https://devfra.me/guide/hub) — subsystems, docks, protocol, `ctx.install`
- [Serve a Hub Anywhere](https://devfra.me/guide/hub-initiate) — `initHub`, the `ui` slot, one auth
- [Client Scripts & Client Context](https://devfra.me/guide/client-context) — `createDevframeClientRuntime`, client-script contract
- [Frameworks](https://devfra.me/frameworks/) — [Vite](https://devfra.me/frameworks/vite) · [Next](https://devfra.me/frameworks/next) · [Nuxt](https://devfra.me/frameworks/nuxt)
- [Vite DevTools adapter](https://devfra.me/adapters/vite) — `createPluginFromDevframe`
