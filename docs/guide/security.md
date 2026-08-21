---
outline: deep
---

# Security

Devframe tools are secure by default: connections bind to `localhost`, and dev-mode RPC requires a trust handshake before accepting a browser.

## Trust model

An RPC handler runs with the full privileges of its host process — filesystem, child processes, network — and a trusted connection can call any registered function, so the boundary that matters is *who may connect*. Two postures cover it:

- **Authenticated (default).** `auth` defaults to `true`; the browser authenticates before calls are accepted, and reconnects with a node-issued bearer token. `createInteractiveAuth` (`devframe/recipes/interactive-auth`) packages the whole protocol into one `DevframeAuthHandler` the adapters wire for you (pass it to `initDevframe` / `initHub` via `auth`).
- **Unauthenticated opt-out.** `auth: false` starts the server with an auto-trust handshake, for single-user tools talking to their own `localhost`.

> [!WARNING]
> `auth: false` trusts every connection that can reach the port. Only use it when the surface is reachable solely by the local developer. Never combine it with a non-loopback bind host, a tunnelled port, or a shared/CI environment.

## The pre-trust gate

Exactly one rule decides what an untrusted connection may call: **a method is reachable before trust iff its name starts with `anonymous:`** (`isAnonymousRpcMethod`, from `devframe/constants`) — carried only by the two handshake methods below.

The RPC server binding enforces this: pass `auth: authHandler` (its `.authorize` becomes the gate) or your own `authorize(methodName, session)` function. Every other call from an untrusted session throws [`DF0036`](../errors/DF0036). `rpc.call` / `rpc.callOptional` / `rpc.callEvent` hold calls issued during the first handshake and release them once it settles, so application code never races the gate.

## Authentication flow

Authentication exchanges a short code for a long-lived token that a node mints and owns:

1. A fresh client calls `anonymous:devframe:auth` with its stored token (empty on first run); the server returns `{ isTrusted: false }` and the UI prompts for a code.
2. The dev server shows a 6-digit code in the terminal — call `auth.printBanner()` once listening; devframe stays headless otherwise.
3. The developer enters it; the browser calls `requestTrustWithCode(code)`.
4. The server verifies the code, mints a high-entropy bearer token, trusts the session, and returns the token.
5. The browser persists the token and presents it on reconnect (or via a `?devframe_auth_token=` query param the connect-time hook checks first); sibling tabs receive it over the `devframe-auth` channel and become trusted too.

The 6-digit code is single-use, expires after five minutes, is compared in constant time, and rotates after repeated wrong attempts. Show it only in a trusted channel (the terminal), never over the network.

The bearer token is a secret. It travels to the server on the WebSocket URL (`?devframe_auth_token=…`), so serve over `wss://`/`https://` whenever the surface is reachable beyond loopback. A client self-revokes (`devframe:auth:revoke`) or a host revokes on its behalf (`revokeAuthToken`); either way affected clients drop to untrusted via `devframe:auth:revoked`.

### The ready-made layer

```ts
import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'

// The adapters gate with this layer by default. Construct it yourself only to
// tune it (e.g. CI tokens) and hand it to `initDevframe` / `initHub` as `auth`.
const auth = createInteractiveAuth(ctx, {
  clientAuthTokens: process.env.CI ? [process.env.DEVFRAME_CI_TOKEN!] : undefined,
})
```

Pass `clientAuthTokens` for CI/shared machines to skip the interactive prompt, or a custom `banner`/`serverUrl`.

### Auth methods

`createInteractiveAuth` registers the handlers on the `devframe/node/auth` primitives.

| RPC method | Direction | Shape |
|------------|-----------|-------|
| `anonymous:devframe:auth` | client → server | `{ authToken, ua, origin }` → `{ isTrusted }` — re-authenticate a stored token |
| `anonymous:devframe:auth:exchange` | client → server | `{ code, ua, origin }` → `{ authToken \| null }` — exchange a code for a token |
| `devframe:auth:revoke` | client → server | self-revoke the caller's own token |
| `devframe:auth:revoked` | server → client | event — token revoked |

Node primitives (`devframe/node/auth`):

| Function | Role |
|----------|------|
| `getTempAuthCode()` / `refreshTempAuthCode()` | read / rotate the one-time code |
| `exchangeTempAuthCode(code, session, { ua, origin }, storage)` | verify a code, mint + store the token, trust the session, return it (or `null`) |
| `verifyAuthToken(token, session, storage)` | trust a session presenting a known token |
| `buildOtpAuthUrl(origin, code?)` | build a magic-link URL embedding the code |
| `revokeAuthToken(context, storage, token)` | delete a token and disconnect sessions using it |

Client methods (`devframe/client`): `requestTrustWithCode(code)`, `requestTrustWithToken(token)`, and `ensureTrusted(timeout?)` / `isTrusted` (the trust gate).

### Magic-link authentication

The standalone CLI (`createCac` / `createDevServer`) prints a link embedding the code for `--open`: an auth-gated server launches a browser carrying the current code, so the tab lands authenticated with no prompt. Build the link yourself with `buildOtpAuthUrl(origin)`:

```
Devtools ready — authenticate this browser: http://localhost:3000/#devframe_otp=123456
```

The code rides the URL **fragment** (`#devframe_otp=…`), which the browser never sends to the server — keeping the single-use code out of access logs and `Referer` headers. `connectDevframe` reads it, exchanges it, and strips it from the URL; only the code ever rides the URL, never the resulting bearer token. Because the link grants trust to whoever opens it within the code's lifetime, print it only to a trusted channel (the terminal).

To drive your own authentication UI, disable the built-in handling with the `otpParam: false` client option, then call `authenticateWithUrlOtp(rpc)` or `consumeOtpFromUrl()` from `devframe/client`.

## Practices for tools built on devframe

- **Stay on loopback.** The default bind host is `localhost`; bind to a routable address only intentionally, and require authentication when you do.
- **Keep `auth: false` local.** The hosted bridges (`devframeViteBridge`, `@devframes/next`'s handler) gate their side-car by default; a host owning the trust boundary another way opts out with `auth: false` explicitly.
- **The MCP route requires an origin.** The route-based MCP server rejects `Origin`-less requests (a request must carry a loopback or allow-listed `Origin`), so an arbitrary local process can't reach it — see [MCP](/adapters/mcp).
- **Treat tokens as secrets.** Never log the bearer token or the one-time code, and never bake either into build output.
- **Authorize every handler.** A registered function is callable by any trusted client. Validate inputs, and mark state-changing functions `type: 'destructive'` so MCP and agent clients prompt before invoking them.
- **Origin-lock remote docks.** When a hub embeds a remote-UI dock, keep `originLock` on (the default) so its session token is only honored on a connection whose `Origin` matches the dock's own.
- **Serve encrypted off-machine.** Use `https://`/`wss://` for any surface reachable beyond `localhost`.

## External viewer origins

WebSocket handshakes from browser extensions and other external viewers carry the viewer's own `Origin` header. A host authorizes that origin through a live registry:

```ts
import { attachWsRpcTransport, createWsOriginRegistry } from 'devframe/rpc/transports/ws-server'

const viewerOrigins = createWsOriginRegistry({
  validateOrigin: origin => origin.startsWith('chrome-extension://')
    || origin.startsWith('moz-extension://'),
})

attachWsRpcTransport(rpc, {
  server,
  allowedOrigins: viewerOrigins,
})
```

Include `viewerOrigins.token` as `viewerOriginToken` in the connection metadata. In the metadata handler, call `viewerOrigins.registerFromUrl(request.url)`; when it returns an origin, set `Access-Control-Allow-Origin` to that value. The external viewer then calls `registerDevframeViewerOrigin(connection)` before connecting.

The registration token grants access through the transport's origin check; RPC authentication still authorizes the session and every non-anonymous method. Keep metadata containing this token same-origin until the registration request has been verified.
