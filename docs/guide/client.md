---
outline: deep
---

# Client

The browser-side client is how a dock iframe, remote-hosted page, or standalone SPA talks to the Devframe server. It provides type-safe RPC calls, access to shared state, and (in dev mode) a trust handshake against the local dev server.

## Connecting

`devframe/client` exports `connectDevframe` (an alias of `getDevframeRpcClient`) — use either name:

```ts
import { connectDevframe } from 'devframe/client'

const rpc = await connectDevframe()

const modules = await rpc.call('my-devframe:get-modules', { limit: 10 })
```

`connectDevframe` auto-detects the backend via `__devframe/__connection.json`, with a sequence of base URLs as fallback. No arguments are needed when the client is hosted from the default mount path.

### Runtime basePath discovery

Devframe SPAs are base-agnostic — the same artifact can be served at `/`, `/__<id>/`, or any custom subpath without rebuilding. `connectDevframe` resolves `__connection.json` at runtime by reading `document.baseURI` and the executing script's URL.

For SPA authors, that means:

- Build with relative asset paths — Vite `base: './'`, Nuxt `vite.base: './'` + `app.baseURL: './'`.
- Leave the mount path out of the HTML. The server serves files at *some* base; the client figures out which.
- Skip the `baseURL` option on `connectDevframe` unless you're connecting across origins or to a non-colocated devframe server.

That's how `createBuild` deploys SPA output verbatim under any URL — no build-time HTML rewriting needed.

### Options

```ts
await connectDevframe({
  baseURL: './', // string or string[] fallback list — see notes below
  authToken: 'user-provided-token',
  cacheOptions: true, // enable response caching
  wsOptions: { /* … */ },
  rpcOptions: { /* birpc options */ },
})
```

| Option | Description |
|--------|-------------|
| `baseURL` | Mount path to probe for `__connection.json`. Accepts an array for fallback. Default: `'./'` — resolved relative to `document.baseURI` so the SPA finds its meta wherever it was deployed. Pass an explicit absolute path (e.g. `'/__devframe/'`) when calling from outside the SPA — say, an embedded webcomponent injected into a host app. |
| `authToken` | Override the auth token. Defaults to a locally-persisted human-readable id. |
| `cacheOptions` | `true` to enable caching with defaults, or an options object. |
| `callTimeout` | Milliseconds after which a pending `rpc.call` rejects with a `DevframeConnectionError` of kind `'timeout'`. Omit (or `0`) to wait indefinitely. See [Handling connection and auth errors](#handling-connection-and-auth-errors). |
| `wsOptions` | Low-level WebSocket transport overrides — `onConnected` / `onError` / `onDisconnected` lifecycle hooks and the socket URL. |
| `rpcOptions` | Forwarded to `birpc`. |
| `connectionMeta` | Pre-known descriptor that skips the `__connection.json` fetch. |

## Modes

The client runs in one of two modes depending on the backend advertised in `__devframe/__connection.json`:

| Backend | When | Capabilities |
|---------|------|--------------|
| `websocket` | Dev mode (`createCac`, Kit) | Full read/write, broadcasts, shared-state mutation. Requires auth. |
| `static` | Build / SPA output | Read-only — all calls resolve against the baked RPC dump. |

The client picks a mode automatically from the backend field. Mode-specific code paths like `broadcast` are scoped to `websocket`.

## Trust & auth (WebSocket mode)

Dev-mode connections become trusted by authenticating. A client that authenticated before presents its stored token automatically on reconnect, and `ensureTrusted()` resolves once the server accepts it:

```ts
const rpc = await connectDevframe()

// Blocks until the server trusts this client (default timeout 60s)
const trusted = await rpc.ensureTrusted()

if (!trusted) {
  console.warn('Not authenticated yet')
}
```

`connectDevframe()` kicks off that same handshake (stored token, then a magic-link OTP on the page URL, then — top-level pages only — a native prompt) the moment it resolves, without making the caller wait for it. `rpc.call` / `rpc.callOptional` / `rpc.callEvent` know about that in-flight handshake internally and hold anything issued before it settles, so application code can call a trusted method right away — e.g. in a component's `onMount` — without an explicit `ensureTrusted()` guard just to avoid a race. Reach for `ensureTrusted()` when you want to reflect the pending state in the UI (a spinner, a "waiting for auth" banner), not to make calls safe.

### Authenticating with a one-time code

A fresh client holds no token. The dev server prints a 6-digit one-time code; pass it to `requestTrustWithCode` to exchange it for a node-issued token. The token is persisted for future reconnections and shared with sibling tabs, which become trusted without re-entering the code:

```ts
const ok = await rpc.requestTrustWithCode('047204')
```

The code is single-use, expires after five minutes, and is rotated after repeated wrong attempts, so re-display the current code if an exchange fails.

To authenticate without typing, a host can print a link embedding the code (`buildOtpAuthUrl(origin)`); `connectDevframe` reads the `devframe_otp` query parameter, exchanges it, and strips it from the URL. Rename it with the `otpParam` option, or set `otpParam: false` and drive authentication yourself with the exposed `authenticateWithUrlOtp(rpc)` / `consumeOtpFromUrl()` utilities.

### Re-using an existing token

Authenticate with a token obtained elsewhere (e.g. another surface) without reloading:

```ts
const ok = await rpc.requestTrustWithToken('a1b2c3…')
```

### Broadcast-channel sync

`connectDevframe` listens on a shared `BroadcastChannel` (named `devframe-auth` for cross-tab handshake interop with Vite DevTools' auth page) for `auth-update` messages. When another tab authenticates — or an auth page announces a token — every open client trusts it automatically, no reload required.

## Calling functions

Derive a [scoped client](./scoped-context) so ids are namespaced for you:

```ts
const my = (await connectDevframe()).scope('my-devframe')

// Standard call — awaits a response or throws.
const modules = await my.rpc.call('get-modules', { limit: 10 })

// Optional — returns undefined when no handler responds (useful while HMR is restarting).
const maybe = await my.rpc.callOptional('get-modules', { limit: 10 })

// Event — fire-and-forget, no response expected.
my.rpc.callEvent('notify', { message: 'hello' })
```

The unscoped `rpc.call('my-devframe:get-modules', ...)` works too. Either way, TypeScript types flow through from the server's `defineRpcFunction` definitions, so argument and return shapes are known at the call site.

## Registering client functions

The client can register functions that the server calls via `rpc.broadcast`:

```ts
import { defineRpcFunction } from 'devframe'

my.rpc.register(defineRpcFunction({
  name: 'on-file-changed', // -> my-devframe:on-file-changed
  type: 'event',
  setup: () => ({
    handler: async ({ file }: { file: string }) => {
      console.log('server says:', file, 'changed')
    },
  }),
}))
```

That's how the server pushes live updates into the UI — file-watcher events, shared-state sync, and so on.

## Shared state

```ts
const state = await my.rpc.sharedState('state') // -> my-devframe:state

console.log(state.value())

state.mutate((draft) => {
  draft.count += 1
})

state.on('updated', (next) => {
  console.log('new state', next)
})
```

Client-side mutations round-trip through the server before reappearing locally. See [Shared State](./shared-state) for the full API.

## Settings

A scoped client also exposes a top-level persisted `settings` store, synced from the server. Read and write per-user (`global`) or per-workspace (`project`) values:

```ts
await my.settings.project.set('theme', 'dark')
const theme = await my.settings.project.get('theme')
```

See [Scoped Context](./scoped-context#settings) for the full API.

## Caching

Set `cacheOptions: true` (or an options object) when constructing the client:

```ts
const rpc = await connectDevframe({ cacheOptions: true })
```

With caching on, `query` / `static` function responses are memoized per argument hash. Server-side broadcasts like `rpc:cache:invalidate` clear entries automatically — plugins that mutate state should broadcast that message after the change.

## Discovery (`__connection.json`)

Devframe writes a JSON descriptor at `<base>/__connection.json` so the client knows where to connect. The dev server shares one port for HTTP and the WebSocket — the socket is bound to a route (`<base>__devframe_ws`) next to the meta file — and advertises it as a relative path:

```json
{
  "backend": "websocket",
  "websocket": { "path": "__devframe_ws" }
}
```

The client resolves that path against the origin it loaded from, swapping `http`→`ws` / `https`→`wss`. It never trusts a host or port baked into the descriptor, so the connection follows the page through a reverse proxy that rewrites the domain, port, or subpath.

The `websocket` field also accepts:

- A `number` — a port on the page's hostname (`ws(s)://<host>:<port>`).
- A full `ws://`/`wss://` URL string — used verbatim for a fixed cross-origin endpoint.
- `{ port }` / `{ host }` — a cross-origin endpoint (e.g. a side-car server on its own port), rooted at that host/port rather than the page origin.

For static mode:

```json
{ "backend": "static" }
```

The client handles this for you. To override discovery (testing, advanced setups), pass `connectionMeta` directly:

```ts
await connectDevframe({
  connectionMeta: { backend: 'static' },
})
```

## Remote docks

Remote docks are a host-side feature — hosts that support them (Vite DevTools is one; see [its remote-client docs](https://devtools.vite.dev/kit/remote-client) for that implementation) inject a connection descriptor into the iframe URL. On the hosted page, `connectDevframe` auto-detects the descriptor from the URL fragment / query string — call it as usual:

```ts
import { connectDevframe } from 'devframe/client'

const rpc = await connectDevframe()
// Already wired to the local dev server via the injected descriptor.
```

The descriptor carries a session-only, pre-approved auth token, so `ensureTrusted()` resolves immediately.

## Events

The client emits over `rpc.events`:

| Event | Fires when |
|-------|------------|
| `rpc:is-trusted:updated` | Trust is granted, denied, or revoked. Carries the new `isTrusted` boolean. |
| `connection:status` | The [connection status](#handling-connection-and-auth-errors) changes. Carries `(status, previous)`. |
| `connection:error` | A connection-level failure occurs — the socket errors, or trust is refused. Carries the `Error`. |
| `rpc:error` | An `rpc.call` rejects, from the server or a down connection. Carries `(error, method)`. |

```ts
rpc.events.on('rpc:is-trusted:updated', (isTrusted) => {
  if (isTrusted)
    console.log('server trusts this client')
  else
    console.log('trust revoked or denied')
})
```

`rpc.isTrusted` is the synchronous read. Subscribe to `rpc:is-trusted:updated` to drive reauth flows or gate rendering until the client is trusted.

## Handling connection and auth errors

A dev-mode client rides a live WebSocket, so it can lose the server mid-session or be refused authentication. Surface those states in your UI — a devtool that keeps spinning with no feedback leaves the user guessing whether it's loading or broken. The client gives you a single status to render from, events to react to, and calls that fail fast instead of hanging.

### Connection status

`rpc.status` collapses the transport and the trust handshake into one value, and `rpc.connectionError` holds the last connection-level `Error` (or `null` when healthy):

| Status | Meaning |
|--------|---------|
| `connecting` | Establishing the socket / running the initial handshake. Calls issued now queue until it opens. |
| `connected` | Socket open and trusted; calls are served. |
| `unauthorized` | Socket open, but the server refused trust. Prompt for [authentication](#authenticating-with-a-one-time-code). |
| `disconnected` | The socket closed — dropped mid-session, or never opened. |
| `error` | A fatal connection error, e.g. the socket errored or the connection meta couldn't load. |

A `static` backend has no live socket, so `rpc.status` is `connected` for its whole life — gating on it is a no-op there, and a build-time SPA never shows a connection state.

### Calls fail fast

Once the socket closes or trust is refused, in-flight and new `rpc.call` promises reject with a `DevframeConnectionError` rather than hanging forever. Its `kind` tells you why, so a `catch` can branch without string-matching:

- `'connection'` — the transport is down (`disconnected` / `error`).
- `'auth'` — the client is `unauthorized`.
- `'timeout'` — the call outlived the `callTimeout` option.

Set `callTimeout` when constructing the client to also cap a live-but-unresponsive server:

```ts
const rpc = await connectDevframe({ callTimeout: 10_000 })
```

### Putting it together

Gate the UI on `connection:status`, and wrap calls to branch on failure:

```ts
import { connectDevframe, DevframeConnectionError } from 'devframe/client'

const rpc = await connectDevframe()

// 1. Render from the live status.
function render() {
  switch (rpc.status) {
    case 'connected': return renderApp()
    case 'connecting': return renderSpinner('Connecting…')
    case 'unauthorized': return renderMessage('Not authorized — reopen the link from your dev server.')
    case 'disconnected': return renderMessage('Disconnected.', { onRetry: reconnect })
    case 'error': return renderMessage(rpc.connectionError?.message ?? 'Connection failed.', { onRetry: reconnect })
  }
}
rpc.events.on('connection:status', render)
render()

// 2. Handle a failing call.
async function loadModules() {
  try {
    return await rpc.call('my-devframe:get-modules', { limit: 10 })
  }
  catch (error) {
    if (error instanceof DevframeConnectionError) {
      // 'connection' | 'auth' | 'timeout' — the UI already reflects rpc.status.
      return null
    }
    throw error // a real server-side error — surface it.
  }
}
```

### Recovering

Recovery is explicit — the client doesn't reconnect on its own. The simplest path is a full page reload, which re-runs `connectDevframe` and the trust handshake; that's what the built-in plugins do behind their **Reload** button. An app that wants to reconnect without a reload can own it by re-running its connect routine to build a fresh client:

```ts
async function reconnect() {
  rpc = await connectDevframe() // a new client; re-subscribe your listeners
  render()
}
```

The five built-in plugins are worked references — each gates its surface on `rpc.status` and offers a reload. In a hub, a viewer can read the same status centrally from [`context.connection`](./client-context#the-client-context) instead of every plugin surfacing its own.
