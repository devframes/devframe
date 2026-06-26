---
outline: deep
---

# Dev

The `dev` adapter is the building block `createCli` uses internally — h3 + WebSocket RPC + the author's SPA mounted at the resolved base path. Reach for it directly to mount the dev server inside an existing CLI program (commander, yargs, hand-rolled CAC) or to attach custom middleware to the underlying h3 app.

```ts
import { createDevServer } from 'devframe/adapters/dev'
import devframe from './devframe'

const handle = await createDevServer(devframe, {
  port: 7777,
  onReady: ({ origin }) => console.log(`Ready at ${origin}`),
})

// graceful shutdown — SIGINT, hot reload, test teardown
process.on('SIGINT', () => handle.close().then(() => process.exit(0)))
```

`createDevServer` returns the underlying `StartedServer` (origin, port, h3 app, WS server, RPC group, `close()`) so callers can integrate it into their own process lifecycle.

| Option | Default | Description |
|--------|---------|-------------|
| `host` | `def.cli?.host ?? 'localhost'` | Bind host. |
| `port` | resolved via `resolveDevServerPort` | Port to listen on. |
| `flags` | `{}` | Parsed flag bag forwarded to `setup(ctx, { flags })`. |
| `distDir` | `def.cli?.distDir` | Required — throws when neither is set. |
| `basePath` | `resolveBasePath(def, 'standalone')` | Mount path override. |
| `app` | fresh h3 app | Pre-configured h3 app to mount onto (custom middleware, auth, extra static assets). |
| `openBrowser` | resolves from `flags.open` / `def.cli?.open` | Explicit on/off override. `false` disables; a string opens that relative path. |
| `ws` | `def.cli?.ws` | How the browser reaches the RPC WebSocket — see below. |
| `onReady` | — | Callback when the WS server is bound. |

## WebSocket endpoint

By default the RPC socket shares the HTTP server's port and binds to the `__devframe_ws` route next to `__connection.json`. The descriptor advertises a *relative* path, so the client connects to its own origin — the link follows the page through a reverse proxy that rewrites the domain, port, or subpath. Configure the three connection scenarios via `def.cli.ws` (or the `ws` call-site option):

```ts
defineDevframe({
  // 1. Same server, a custom route (default route is `__devframe_ws`):
  cli: { ws: { route: '__sockets' } },

  // 2. A dedicated port on the same host:
  cli: { ws: { port: 9788 } },

  // 3. A remote, fully-qualified endpoint (e.g. a tunnel/relay):
  cli: { ws: { url: 'wss://devtools.example.com/relay/__devframe_ws' } },
})
```

| Field | Scenario | Advertised `websocket` |
|-------|----------|------------------------|
| `route` | same server, different route | `{ path: <route> }` (same origin) |
| `port` | different port | `{ port, path: <route> }` (page host) |
| `url` | remote, different origin | the URL string, used verbatim |

Precedence is `url` > `port` > `route`. In the remote case the dev server still hosts the socket locally on `route`; point your tunnel at it.

## Port resolution

`resolveDevServerPort(def, opts?)` resolves a port up-front (to print or log it) before the server starts:

```ts
import { resolveDevServerPort } from 'devframe/adapters/dev'

const port = await resolveDevServerPort(devframe, { host: '127.0.0.1' })
// honors def.cli?.port / portRange / random
```

| Option | Default | Description |
|--------|---------|-------------|
| `host` | `def.cli?.host ?? 'localhost'` | Bind host (passed to `get-port-please` for in-use detection). |
| `defaultPort` | `def.cli?.port ?? 9999` | Override the preferred port. |
