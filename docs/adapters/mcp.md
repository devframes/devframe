---
outline: deep
---

# MCP

> [!WARNING] Experimental
> The agent-native surface is experimental and may change without a major version bump.

Translates a devframe's agent host into a [Model Context Protocol](https://modelcontextprotocol.io) server so coding agents (Claude Desktop, Cursor, Zed, Claude Code) can call flagged RPCs and read exposed resources.

```ts
import { createMcpServer } from 'devframe/adapters/mcp'
import devframe from './devframe'

await createMcpServer(devframe, { transport: 'stdio' })
```

`@modelcontextprotocol/server` is a peer dependency — install it when shipping MCP support. `createMcpServer` speaks the `stdio` transport, spawned per session by the client.

## Route-based server

The dev server can expose the same agent surface over HTTP, so an MCP client connects to the **running** server and sees live tool and resource changes. Enable it with `cli.mcp`:

```ts
import { defineDevframe } from 'devframe'

export default defineDevframe({
  // …
  cli: {
    mcp: true,
  },
})
```

The endpoint speaks the MCP Streamable-HTTP transport at `/__mcp` (relative to the base path — `/__<id>/__mcp` under a host), sharing the dev server's origin and port. The `--mcp` and `--no-mcp` flags override the definition per run. `__connection.json` advertises the route so in-browser tooling can discover it.

Each client session gets its own MCP server built from the live context, correlated by the `Mcp-Session-Id` header, so `tools/list_changed` and `resources/list_changed` notifications reach connected clients as the tool evolves. The dev server mints a per-instance bearer token and the endpoint requires it as `Authorization: Bearer <token>` — the real authentication, since the origin gate only ever constrains browsers (a non-browser client can omit or spoof the `Origin` header). The token is recorded in the instance registry (a user-private file, mode `0600`) so `devframe connect` presents it automatically; a client dialing the route directly reads it from `StartedServer.mcpAuthToken`. The endpoint binds to the same loopback host as the dev server and keeps the shared loopback origin gate as defense-in-depth; widen it for a tunnel or LAN origin:

```ts
defineDevframe({
  // …
  cli: {
    mcp: { allowedOrigins: ['https://tunnel.example.com'] },
  },
})
```

### Hosted bridges

Both hosted bridges forward the same option to their side-car dev server and advertise the endpoint (with its port) in the `__connection.json` they serve:

```ts
// Vite
viteDevBridge(devframe, { devMiddleware: true, mcp: true })

// Next.js (@devframes/next)
createDevframeNextHandler(devframe, { mcp: true })
```

## Custom hosts

`createMcpFetchHandler(ctx, options)` returns the endpoint as a web-standard `Request → Response` handler plus a `dispose()` for session teardown — mount it on any fetch-shaped server (a Next.js App Router route, a custom Node server). The h3 `mountMcpHttp` used by the dev server is a thin wrapper over it.

```ts
import { createMcpFetchHandler } from 'devframe/adapters/mcp'
import { randomToken } from 'devframe/utils/crypto-token'

const authToken = randomToken()
const mcp = createMcpFetchHandler(ctx, {
  serverName: 'my-tool (devframe)',
  serverVersion: '1.0.0',
  exposeSharedState: true,
  // Required for every request as `Authorization: Bearer <token>`. Hand it to
  // trusted clients out-of-band — e.g. record it in the instance registry.
  authToken,
})
// route every method on /__mcp to mcp.fetch(request)
```

## Discovery: `devframe connect`

The `devframe` bin ships an MCP **connector** — a thin discovery + proxy server in the shape [next-devtools-mcp](https://github.com/vercel/next-devtools-mcp) validated. Configure it once in an agent client and it finds every running devframe:

```json
{
  "mcpServers": {
    "devframe": { "command": "npx", "args": ["devframe", "connect"] }
  }
}
```

It exposes two gateway tools (the wire names of the `devframe:connect:*` ids — see [tool ids and wire names](/guide/agent-native#tool-ids-and-wire-names)):

- **`devframe_connect_list-instances`** — discover running devframe dev servers and list each one's MCP tools. Instances running without an MCP route are listed with a hint to restart with `--mcp`.
- **`devframe_connect_call-tool`** — invoke one tool on one instance (`{ port, tool, args }`) over its Streamable-HTTP endpoint.

Discovery reads the **instance registry**: every `createDevServer` (CLI `dev`, `viteDevBridge`, `@devframes/next`'s handler) writes a record to `~/.devframe/instances/<pid>-<port>.json` on boot and removes it on close; readers prune records whose liveness probe fails. The record carries the instance's MCP bearer token (in a file written mode `0600`), which the connector presents on every call — so `devframe connect` reaches a token-gated route without any configuration. In-process hosts register explicitly with `registerDevframeInstance` from `devframe/node` — see `createDevframeNextHost().mountMcp`, which mints and returns the token to record, for serving MCP on a Next app's own origin. `--port <n>` probes an explicit port besides the registry; `DEVFRAME_INSTANCES_DIR` relocates the registry and `DEVFRAME_DISABLE_INSTANCE_REGISTRY=1` opts a server out.

See the [Agent-Native](/guide/agent-native) page for the full API, safety model, and Claude Desktop integration example.
