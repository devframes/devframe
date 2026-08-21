---
outline: deep
---

# MCP

Exposes a devframe's agent host as a [Model Context Protocol](https://modelcontextprotocol.io) server: agents call flagged RPCs and read resources.

```ts
import { createMcpServer } from 'devframe/adapters/mcp'
import devframe from './devframe'

await createMcpServer(devframe, { transport: 'stdio' })
```

`@modelcontextprotocol/server` is a peer dependency; `createMcpServer` speaks `stdio`, spawned per session.

## Route-based server

The dev server exposes the same surface over HTTP, live. Enable with `cli.mcp`:

```ts
import { defineDevframe } from 'devframe'

export default defineDevframe({
  // …
  cli: {
    mcp: true,
  },
})
```

The endpoint speaks Streamable-HTTP at `/__mcp` (`/__<id>/__mcp` under a host), sharing its origin/port. `--mcp` / `--no-mcp` override; `__connection.json` advertises it.

Each session gets its own MCP server, keyed by `Mcp-Session-Id`. An origin gate requires `Origin` be loopback (or allow-listed) and rejects `Origin`-less requests. Widen for a tunnel/LAN origin with `cli: { mcp: { allowedOrigins: ['https://tunnel.example.com'] } }`.

### Hosted bridges

Both bridges forward it to their side-car dev server, advertising the endpoint in `__connection.json`:

```ts
// Vite (@devframes/vite)
devframeViteBridge(devframe, { mcp: true })

// Next.js (@devframes/next)
createDevframeNextHandler(devframe, { mcp: true })
```

## Custom hosts

`createMcpFetchHandler(ctx, options)` returns the endpoint as a `Request → Response` handler plus a `dispose()` — mount on any fetch server.

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

The `devframe` bin ships an MCP **connector** ([next-devtools-mcp](https://github.com/vercel/next-devtools-mcp)-style) that finds every running devframe. Configure once:

```json
{
  "mcpServers": {
    "devframe": { "command": "npx", "args": ["devframe", "connect"] }
  }
}
```

Two gateway tools (`devframe:connect:*` ids — see [tool ids and wire names](/guide/agent-native#tool-ids-and-wire-names)):

- **`devframe_connect_list-instances`** — list running dev servers and their MCP tools.
- **`devframe_connect_call-tool`** — invoke one tool on an instance (`{ port, tool, args }`) over Streamable-HTTP.

Discovery reads the **instance registry**: every `createDevServer` writes `~/.devframe/instances/<pid>-<port>.json`, dialed with a loopback origin. In-process hosts register via `registerDevframeInstance` (`devframe/node`). `--port <n>` probes a port; `DEVFRAME_INSTANCES_DIR` relocates the registry, `DEVFRAME_DISABLE_INSTANCE_REGISTRY=1` opts out.

See [Agent-Native](/guide/agent-native) for the API and safety model.
