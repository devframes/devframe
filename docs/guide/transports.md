---
outline: deep
---

# Transports

Devframe serves live RPC over two interchangeable transports — a WebSocket and an SSE endpoint — so a client connects even where the WebSocket upgrade is unavailable (serverless platforms, buffering reverse proxies, restrictive corporate networks). Both speak the identical birpc wire protocol with the same per-method serialization, auth handshake, origin policy, shared state, and streaming; switching transports changes nothing about how you write or call RPC functions.

## What the server binds

A live instance binds both by default:

- **WebSocket** at `<base>__ws` — the primary transport, one full-duplex socket.
- **SSE** at `<base>__sse` — one method-dispatched route: `GET` opens the server→client event stream, `POST` carries client→server RPC frames. It rides the same HTTP surface that serves `__connection.json`, so wherever discovery works, SSE works — including through the Vite bridge's middleware and `initDevframe`'s `handler` / `nodeMiddleware` on hosts that never see upgrade events.

`__connection.json` advertises what's bound; `backend` names the server's primary transport:

```json
{
  "backend": "websocket",
  "websocket": { "path": "__ws" },
  "sse": { "path": "__sse" }
}
```

The SSE stream carries a keep-alive comment every 30 seconds so idle connections survive intermediaries. Both endpoints share one session space — auth trust, shared-state subscriptions, and streaming replay behave identically on either.

### Configuring

```ts
// SSE-only — hosts/proxies where the upgrade can't happen. Clients
// connect over SSE automatically (backend: 'sse').
initDevframe(def, { base: '/__my-tool/', ws: false })

// WebSocket-only — opt out of the SSE endpoint.
initDevframe(def, { base: '/__my-tool/', server, sse: false })

// Rename the SSE route.
initDevframe(def, { base: '/__my-tool/', server, sse: { route: '__events' } })
```

`ws: false` together with `sse: false` runs an RPC-less shell (`backend: 'none'`) — the SPA, discovery, and MCP routes still serve. The same options apply to `createDevServer`, `initHub`, and a definition's `cli.ws` / `cli.sse` defaults.

## What the client picks

`connectDevframe` trusts the server's advertisement: it connects over the declared primary, preferring the WebSocket when both endpoints are present. A server that binds no socket advertises SSE as its primary, so the client lands there with no probing or fallback logic.

Pin a transport explicitly when you know better than the advertisement — the typical case is an intermediary that silently strips WS upgrades, which the server cannot detect:

```ts
const client = await connectDevframe({ transport: 'sse' })

client.transport // 'websocket' | 'sse' | 'static' — what actually connected
```

Pinning a transport the server doesn't advertise rejects with a clear error. SSE endpoints resolve with the same proxy-safe rules as WebSocket ones: relative paths against `__connection.json`'s own URL, an explicit `host`/`port` only for a genuinely cross-origin endpoint.

A dropped SSE stream ends the client exactly like a closed socket — pending calls reject, the status moves to `disconnected`, and reconnecting means calling `connectDevframe` again.
