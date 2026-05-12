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

`@modelcontextprotocol/sdk` is a peer dependency — install it when shipping MCP support. The current transport is `stdio`.

See the [Agent-Native](/guide/agent-native) page for the full API, safety model, and Claude Desktop integration example.
