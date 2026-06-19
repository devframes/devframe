---
outline: deep
---

# Security

Devframe tools are secure by default: connections bind to `localhost`, and dev-mode RPC requires a trust handshake before a browser is accepted. This page covers the trust model and the practices that keep a tool safe as it moves beyond a single developer's machine.

## Trust model

An RPC handler runs with the full privileges of the process hosting it — filesystem, child processes, network. A trusted connection can call any registered function, so the boundary that matters is *who is allowed to connect*.

Two postures cover that boundary:

- **Authenticated (default).** `auth` defaults to `true`. The browser pairs with the server before calls are accepted, and reconnects by presenting a node-issued bearer token. Devframe supplies the node-side primitives (`exchangeTempAuthCode`, `verifyAuthToken`); the host adapter — e.g. Vite DevTools — provides the interactive handler and pairing UI.
- **Unauthenticated opt-out.** Setting `auth: false` starts the server with an auto-trust handshake. It exists for single-user tools talking to their own `localhost`, where a round-trip would only add friction.

> [!WARNING]
> `auth: false` trusts every connection that can reach the port. Only use it when the surface is reachable solely by the local developer. Never combine it with a non-loopback bind host, a tunnelled port, or a shared/CI environment.

## Pairing and tokens

Pairing exchanges a short code for a long token:

1. The dev server shows a 6-digit one-time code in the developer's terminal.
2. The developer types it into the browser, which calls `requestTrustWithCode(code)`.
3. The server verifies the code, mints a high-entropy bearer token, records it as trusted, and returns it.
4. The browser persists the token and presents it on reconnect; sibling tabs receive it over the `devframe-auth` channel.

The 6-digit code is single-use, expires after five minutes, is compared in constant time, and rotates after repeated wrong attempts — which is what keeps a short code brute-force resistant. Show it only in a trusted channel (the terminal), never over the network.

The bearer token is a secret. It travels to the server on the WebSocket URL (`?devframe_auth_token=…`), so serve over `wss://`/`https://` whenever the surface is reachable beyond loopback. Revoke a token with `revokeAuthToken(context, storage, token)`; affected clients drop to untrusted via the `devframe:auth:revoked` event.

## Practices for tools built on devframe

- **Stay on loopback.** The default bind host is `localhost`. Bind to a routable address only when you intend to, and require authentication when you do.
- **Keep `auth: false` local.** Reach for it only for single-user localhost tools; leave the default in place anywhere a connection could originate elsewhere.
- **Treat tokens as secrets.** Never log the bearer token or the pairing code, and never bake either into build output.
- **Authorize every handler.** A registered function is callable by any trusted client. Validate inputs, and mark state-changing functions `type: 'destructive'` so MCP and agent clients prompt before invoking them.
- **Origin-lock remote docks.** When a hub embeds a remote-UI dock, enable `originLock` so a dock token is only honored from its expected origin.
- **Serve encrypted off-machine.** Use `https://`/`wss://` for any surface reachable beyond `localhost`.
