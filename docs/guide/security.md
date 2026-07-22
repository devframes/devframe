---
outline: deep
---

# Security

Devframe tools are secure by default: connections bind to `localhost`, and dev-mode RPC requires a trust handshake before a browser is accepted. This page covers the trust model and the practices that keep a tool safe as it moves beyond a single developer's machine.

## Trust model

An RPC handler runs with the full privileges of the process hosting it — filesystem, child processes, network. A trusted connection can call any registered function, so the boundary that matters is *who is allowed to connect*.

Two postures cover that boundary:

- **Authenticated (default).** `auth` defaults to `true`. The browser authenticates with the server before calls are accepted, and reconnects by presenting a node-issued bearer token. `devframe/recipes/interactive-auth`'s `createInteractiveAuth` packages the whole protocol — handshake handlers, the resolver gate, connect-time trust, and the code/link banner — into a single `DevframeAuthHandler` you pass straight to `startHttpAndWs({ auth })`.
- **Unauthenticated opt-out.** Setting `auth: false` starts the server with an auto-trust handshake. It exists for single-user tools talking to their own `localhost`, where a round-trip would only add friction.

> [!WARNING]
> `auth: false` trusts every connection that can reach the port. Only use it when the surface is reachable solely by the local developer. Never combine it with a non-loopback bind host, a tunnelled port, or a shared/CI environment.

## The pre-trust gate

Exactly one rule decides what an untrusted connection may call: **a method is reachable before trust iff its name starts with `anonymous:`** (`isAnonymousRpcMethod`, from `devframe/constants`). There is no separate allowlist to keep in sync — the two handshake methods below carry the prefix precisely because they're the only ones an unauthenticated caller needs.

`startHttpAndWs` enforces this itself once you give it something to enforce: pass `auth: authHandler` (its `.authorize` becomes the gate) or your own `authorize(methodName, session)` function. Every other call from an untrusted session throws [`DF0036`](../errors/DF0036).

On the client, `connectDevframe()` kicks off the handshake below without waiting for it, so a naive client could otherwise race it — sending a trusted call over the freshly-opened socket before the server has had a chance to answer `anonymous:devframe:auth`, hitting this exact gate. `rpc.call` / `rpc.callOptional` / `rpc.callEvent` hold anything issued while that first handshake is still in flight and release it once the handshake settles, so application code never has to special-case this window itself.

## Authentication flow

Authentication exchanges a short code for a long-lived token. A node mints and owns the token; the browser only ever sends the short code, and only over the open socket.

1. A fresh client connects unauthenticated and calls `anonymous:devframe:auth` with its stored token (empty on first run). The server returns `{ isTrusted: false }`, so the trust gate stays open while the UI prompts for a code.
2. The dev server shows a 6-digit one-time code in the developer's terminal — call `auth.printBanner()` once the server is listening; devframe stays headless otherwise.
3. The developer enters it; the browser calls `requestTrustWithCode(code)` → `anonymous:devframe:auth:exchange`.
4. The server verifies the code, mints a high-entropy bearer token, records it as trusted, marks the session trusted, and returns the token.
5. The browser persists the token and presents it on reconnect (`anonymous:devframe:auth` → `verifyAuthToken`, or as a `?devframe_auth_token=` query param the connect-time hook checks before the handshake even runs); sibling tabs receive it over the `devframe-auth` channel and become trusted too.

The 6-digit code is single-use, expires after five minutes, is compared in constant time, and rotates after repeated wrong attempts — which is what keeps a short code brute-force resistant. Show it only in a trusted channel (the terminal), never over the network.

The bearer token is a secret. It travels to the server on the WebSocket URL (`?devframe_auth_token=…`), so serve over `wss://`/`https://` whenever the surface is reachable beyond loopback. A client can give up its own token by calling `devframe:auth:revoke`; a host can revoke on a client's behalf with `revokeAuthToken(context, storage, token)`. Either way, affected clients drop to untrusted via the `devframe:auth:revoked` event.

### The ready-made layer

```ts
import { startHttpAndWs } from 'devframe/node'
import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'

const auth = createInteractiveAuth(ctx, {
  clientAuthTokens: process.env.CI ? [process.env.DEVFRAME_CI_TOKEN!] : undefined,
})

const server = await startHttpAndWs({ context: ctx, port: 9999, auth })
auth.printBanner()
```

`createInteractiveAuth` closes over the auth storage internally — nothing here reaches into `devframe/node/hub-internals`. Pass `clientAuthTokens` for CI/shared machines that should skip the interactive prompt entirely, or a custom `banner`/`serverUrl` to change how the code is presented.

### Auth methods

Devframe owns the wire contract; `createInteractiveAuth` registers the handlers on top of the `devframe/node/auth` primitives (the standalone server registers a noop auto-trust handler when `auth: false`).

| RPC method | Direction | Shape |
|------------|-----------|-------|
| `anonymous:devframe:auth` | client → server | `{ authToken, ua, origin }` → `{ isTrusted }` — re-authenticate a stored token |
| `anonymous:devframe:auth:exchange` | client → server | `{ code, ua, origin }` → `{ authToken \| null }` — exchange a one-time code for a token |
| `devframe:auth:revoke` | client → server | — self-revoke: drop the caller's own token |
| `devframe:auth:revoked` | server → client | event — the connection's token was revoked |

Node primitives (`devframe/node/auth`):

| Function | Role |
|----------|------|
| `getTempAuthCode()` / `refreshTempAuthCode()` | read / rotate the current one-time code to display |
| `exchangeTempAuthCode(code, session, { ua, origin }, storage)` | verify a code, mint + store the token, trust the session, return the token (or `null`) |
| `verifyAuthToken(token, session, storage)` | trust a session presenting a known token (reconnect) |
| `buildOtpAuthUrl(origin, code?)` | build a magic-link URL embedding the code |
| `revokeAuthToken(context, storage, token)` | delete a token and disconnect any sessions using it |

Client methods (`devframe/client`): `requestTrustWithCode(code)` (exchange a code), `requestTrustWithToken(token)` (re-authenticate a token), `ensureTrusted(timeout?)` / `isTrusted` (the trust gate).

### Magic-link authentication

To skip typing, a host can print a link that embeds the code and open the browser straight into an authenticated session. The standalone CLI (`createCac` / `createDevServer`) does this automatically for `--open`: when the server is auth-gated, the browser it launches already carries the current code, so the tab lands authenticated with no prompt at all. Build the link yourself from the current code with `buildOtpAuthUrl(origin)` (devframe stays headless, so the host prints its own banner):

```
Devtools ready — authenticate this browser: http://localhost:3000/?devframe_otp=123456
```

`connectDevframe` reads the `devframe_otp` parameter, exchanges it, and removes it from the URL before anything else. Only the short-lived, single-use **code** ever rides the URL — the resulting bearer token is stored, never written back to it. Because the link grants trust to whoever opens it within the code's lifetime, print it only to a trusted channel (the terminal), exactly as you would the bare code.

Higher-level integrations can drive their own authentication UI instead: disable the built-in handling with the `otpParam: false` client option, then call the exposed `authenticateWithUrlOtp(rpc)` (consume the code from the URL and exchange it) or `consumeOtpFromUrl()` (read and strip the code) from `devframe/client`.

## Practices for tools built on devframe

- **Stay on loopback.** The default bind host is `localhost`. Bind to a routable address only when you intend to, and require authentication when you do.
- **Keep `auth: false` local.** Reach for it only for single-user localhost tools; leave the default in place anywhere a connection could originate elsewhere.
- **Treat tokens as secrets.** Never log the bearer token or the one-time code, and never bake either into build output.
- **Authorize every handler.** A registered function is callable by any trusted client. Validate inputs, and mark state-changing functions `type: 'destructive'` so MCP and agent clients prompt before invoking them.
- **Origin-lock remote docks.** When a hub embeds a remote-UI dock, enable `originLock` so a dock token is only honored from its expected origin.
- **Serve encrypted off-machine.** Use `https://`/`wss://` for any surface reachable beyond `localhost`.
