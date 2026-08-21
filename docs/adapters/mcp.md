---
outline: deep
---

# MCP

Translates a devframe's agent host into a [Model Context Protocol](https://modelcontextprotocol.io) server: agents call flagged RPCs and read exposed resources.

```ts
import { createMcpServer } from 'devframe/adapters/mcp'
import devframe from './devframe'

await createMcpServer(devframe, { transport: 'stdio' })
```

`@modelcontextprotocol/server` is a peer dependency. `createMcpServer` speaks `stdio`, spawned per session.

## Route-based server

The dev server exposes the same surface over HTTP with live changes. Enable with `cli.mcp`:

```ts
import { defineDevframe } from 'devframe'

export default defineDevframe({
  // …
  cli: {
    mcp: true,
  },
})
```

The endpoint speaks Streamable-HTTP at `/__mcp` (`/__<id>/__mcp` under a host), sharing its origin/port. `--mcp` / `--no-mcp` override per run; `__connection.json` advertises the route.

Each session gets its own MCP server from the live context, keyed by `Mcp-Session-Id`. An origin gate requires `Origin` be loopback (or allow-listed); unlike WS it rejects `Origin`-less requests — `devframe connect` sends its loopback origin explicitly. Widen for a tunnel/LAN origin with `cli: { mcp: { allowedOrigins: ['https://tunnel.example.com'] } }`.

### Hosted bridges

Both bridges forward the option to their side-car dev server, advertising the endpoint in `__connection.json`:

```ts
// Vite (@devframes/vite)
devframeViteBridge(devframe, { mcp: true })

// Next.js (@devframes/next)
createDevframeNextHandler(devframe, { mcp: true })
```

## Custom hosts

`createMcpFetchHandler(ctx, options)` returns the endpoint as a `Request → Response` handler plus a `dispose()` for teardown — mount it on any fetch server.

```ts
import { createMcpFetchHandler } from 'devframe/adapters/mcp'

const mcp = createMcpFetchHandler(ctx, {
  serverName: 'my-tool (devframe)',
  serverVersion: '1.0.0',
  exposeSharedState: true,
})
// route every method on /__mcp to mcp.fetch(request)
```

## Discovery: `devframe connect`

The `devframe` bin ships an MCP **connector** ([next-devtools-mcp](https://github.com/vercel/next-devtools-mcp)-style) that finds every running devframe. Configure it once:

```json
{
  "mcpServers": {
    "devframe": { "command": "npx", "args": ["devframe", "connect"] }
  }
}
```

Two gateway tools (`devframe:connect:*` ids — see [tool ids and wire names](/guide/agent-native#tool-ids-and-wire-names)):

- **`devframe_connect_list-instances`** — list running dev servers and their MCP tools; those without a route hint at `--mcp`.
- **`devframe_connect_call-tool`** — invoke one tool on an instance (`{ port, tool, args }`) over Streamable-HTTP.

Discovery reads the **instance registry**: every `createDevServer` writes `~/.devframe/instances/<pid>-<port>.json` on boot; the connector dials each with its loopback origin. In-process hosts register via `registerDevframeInstance` (`devframe/node`). `--port <n>` probes an explicit port; `DEVFRAME_INSTANCES_DIR` relocates the registry, `DEVFRAME_DISABLE_INSTANCE_REGISTRY=1` opts out.

See [Agent-Native](/guide/agent-native) for the full API, safety model, and example.
