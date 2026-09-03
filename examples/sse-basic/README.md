# sse-basic

The smallest SSE-only devframe: `ws: false` binds no WebSocket, so every RPC frame - calls, shared state, the auth handshake - rides plain HTTP at `/__sse-basic/__sse`. This is the transport for host frameworks and proxies where the WebSocket upgrade isn't available.

```sh
pnpm --filter sse-basic dev    # Vite app + the SSE node bridge, with HMR
pnpm --filter sse-basic play   # build the SPA, then serve it over SSE from a standalone host
```

Open the printed URL. The page shows:

- **Transport** - `rpc.transport`, which lands on `sse` because the server advertises `backend: 'sse'`; the client needs no options.
- **Server clock** - a shared state the server mutates every second, synced down the SSE event stream with no polling.
- **Server uptime** / **Increment** - ordinary RPC calls, each an HTTP `POST` whose response body carries the result.

## How it works

`src/node/index.ts` is the whole tool: a `defineDevframe` definition with two RPC functions and a shared-state clock. `app/` is the vanilla SPA (`app/main.ts` calls `connectDevframe({ baseURL: '/__sse-basic/' })`), and `app/vite.config.ts` bridges the node side onto the dev server with `initDevframe(def, { base: '/__sse-basic/', ws: false, auth: false })` for HMR. `playgrounds/server.mjs` boots the built SPA over the same SSE host.

There is no upgrade wiring anywhere; ordinary request middleware serves discovery (`__connection.json`), the SSE stream (`GET __sse`), and RPC frames (`POST __sse`). Everything works exactly as it would over a WebSocket.

See the [Transports guide](https://devfra.me/guide/transports) for the full transport model, including running both transports side by side and pinning one from the client.
