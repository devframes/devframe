---
outline: deep
---

# Agent-Native Devframe

Devframe exposes its browser-UI surface — RPC functions, resources, shared state — to agents over MCP, opt-in per function.

## How it works

Three pieces: the **`agent` field** on `defineRpcFunction`, **`ctx.agent`** (non-RPC tools + resources), and the **MCP adapter** (`devframe/adapters/mcp`) serving an [MCP](https://modelcontextprotocol.io) server.

## Exposing an RPC function

```ts
import { defineRpcFunction } from 'devframe'

export const getSessionSummary = defineRpcFunction({
  name: 'rolldown-get-session-summary',
  type: 'query',
  args: [v.object({ sessionId: v.string() })],
  returns: v.object({ durationMs: v.number(), chunkCount: v.number() }),
  agent: {
    description: 'Summarize a Rolldown build session. Safe to call freely.',
    title: 'Build summary',
    // safety inferred from `type: 'query'` → 'read'
  },
  setup: ctx => ({
    handler: async ({ sessionId }) => {
      // ...
    },
  }),
})
```

## Tool ids and wire names

- **The id** — registers/invokes in devframe, colon-namespaced: `devframes:plugin:<slug>:<fn>` (plugin RPCs), `devframe:<area>:<fn>` (built-ins), command ids.
- **The wire name** — what MCP clients call, constrained to `^[a-zA-Z0-9_-]{1,128}$`; runs outside that set collapse to `_`, truncated to 128.

```
devframe:state:read          → devframe_state_read
devframes:plugin:git:status  → devframes_plugin_git_status
my-plugin:summarize          → my-plugin_summarize
```

`toAgentToolName` (`devframe/utils/agent-tool-name`, client-safe) predicts a wire name; two ids sanitizing alike keep the first, the later hidden with `DF0047`.

## Registering a plugin tool

Tools without a matching RPC register directly.

```ts
export default defineDevframe({
  id: 'my-plugin',
  setup(ctx) {
    ctx.agent.registerTool({
      id: 'my-plugin:summarize',
      description: 'Plain-text summary of the current build state.',
      safety: 'read',
      handler: async () => ({
        markdown: buildSummary(),
      }),
    })
  },
})
```

## Deriving tools from other state

Register a **provider** for tools derived from state, queried at list/invoke time:

```ts
const handle = ctx.agent.registerToolProvider(() =>
  currentCommands()
    .filter(command => command.agent)
    .map(command => toAgentTool(command)),
)

// After the underlying state changes, nudge connected MCP clients:
handle.notifyChanged() // fires tools/list_changed
```

## Registering a resource

Readable snapshots by URI:

```ts
ctx.agent.registerResource({
  id: 'current-session',
  name: 'Current Rolldown session',
  description: 'Markdown snapshot of the active build session.',
  mimeType: 'text/markdown',
  read: () => ({ text: renderMarkdown(currentSession) }),
})
```

Every `ctx.rpc.sharedState` key is exposed as a `devframe://state/<key>` resource and via the **`devframe:state:read` tool** (wire `devframe_state_read`): no args → key list, `key` → its value. `exposeSharedState: false` (or a filter) on `createMcpServer` opts out.

## Starting the MCP server

CLI:

```sh
# Run your devtool with an MCP stdio server attached.
devframe mcp
```

Programmatically:

```ts
import { defineDevframe } from 'devframe'
import { createMcpServer } from 'devframe/adapters/mcp'

const devframe = defineDevframe({ /* … */ })

await createMcpServer(devframe, { transport: 'stdio' })
```

`@modelcontextprotocol/server` is a peer dependency.

## Connecting Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-devframe": {
      "command": "pnpm",
      "args": ["--filter", "my-devframe", "exec", "devframe", "mcp"]
    }
  }
}
```

Restart; tools appear in the drawer, resources as `devframe://resource/<id>` / `devframe://state/<key>` URIs.

## Writing descriptions agents act on

Describe *when* to use a tool, not just its return:

<!-- eslint-skip -->

```ts
// ✗ Bad: describes the mechanism
agent: { description: 'Returns the session summary object.' }
// ✓ Good: tells the agent when and why
agent: { description: 'Summarize the current build session — durations, chunk counts, warnings. Call this before proposing any build-config change.' }
```

## Gateway tools

A gateway tool returns *instructions and locations*, not work agents do better:

```ts
ctx.agent.registerTool({
  id: 'my-plugin:docs',
  description: 'Locate the version-accurate docs for this tool. Call before answering questions about its config format.',
  safety: 'read',
  handler: () => ({
    docsPath: resolveInstalledDocsDir(),
    hint: 'Read the file matching your topic; do not rely on training-data knowledge of this config format.',
  }),
})
```

## Structured errors

A coded diagnostic thrown from a handler crosses the MCP boundary as JSON:

```json
{ "error": { "code": "DF0017", "message": "…", "fix": "…", "docs": "https://devfra.me/errors/df0017" } }
```

Prefer coded diagnostics anywhere agent-reachable: agents act on `fix` and follow `docs`.

## Safety model

- **`safety`** — `'read'`, `'action'`, or `'destructive'`. Inferred from the RPC `type` (`static`/`query` → `read`, `action`/`event` → `action`), overridable.
- The adapter maps `safety` to tool annotations (`readOnlyHint`, `destructiveHint`).

## CLI

| Command | Description |
|---------|-------------|
| `<your-app> mcp` | Start the MCP server on `stdio`. |
| `<your-app> dev --mcp` | Serve the agent surface on `/__mcp`. |
| `devframe connect` | Discover running devframes and proxy their tools — see [MCP adapter](/adapters/mcp#discovery-devframe-connect). |
