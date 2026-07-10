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

`@modelcontextprotocol/sdk` is a peer dependency — install it when shipping MCP support. `createMcpServer` speaks the `stdio` transport, spawned per session by the client.

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

Each client session gets its own MCP server built from the live context, correlated by the `Mcp-Session-Id` header, so `tools/list_changed` and `resources/list_changed` notifications reach connected clients as the tool evolves. The endpoint binds to the same loopback host as the dev server and applies the shared loopback origin gate; widen it for a tunnel or LAN origin:

```ts
defineDevframe({
  // …
  cli: {
    mcp: { allowedOrigins: ['https://tunnel.example.com'] },
  },
})
```

See the [Agent-Native](/guide/agent-native) page for the full API, safety model, and Claude Desktop integration example.
