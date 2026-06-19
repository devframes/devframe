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
| `wsOptions` | Forwarded to the WebSocket transport (reconnect, heartbeat, etc.). |
| `rpcOptions` | Forwarded to `birpc`. |
| `connectionMeta` | Pre-known descriptor that skips the `__connection.json` fetch. |

## Modes

The client runs in one of two modes depending on the backend advertised in `__devframe/__connection.json`:

| Backend | When | Capabilities |
|---------|------|--------------|
| `websocket` | Dev mode (`createCli`, Kit) | Full read/write, broadcasts, shared-state mutation. Requires auth. |
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

Devframe writes a JSON descriptor at `<base>/__connection.json` so the client knows where to connect:

```json
{
  "backend": "websocket",
  "websocket": "ws://localhost:9999/__ws"
}
```

or for static mode:

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

```ts
rpc.events.on('rpc:is-trusted:updated', (isTrusted) => {
  if (isTrusted)
    console.log('server trusts this client')
  else
    console.log('trust revoked or denied')
})
```

`rpc.isTrusted` is the synchronous read. Subscribe to `rpc:is-trusted:updated` to drive reauth flows or gate rendering until the client is trusted.
