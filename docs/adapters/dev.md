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
| `onReady` | — | Callback when the WS server is bound. |

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
