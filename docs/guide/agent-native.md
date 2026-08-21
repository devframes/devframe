---
outline: deep
---

# Agent-Native Devframe

Devframe exposes the same surface a browser UI consumes — RPC functions, resources, shared state — to coding agents over MCP. Exposure is opt-in per function; functions stay private by default.

## How it works

Three building blocks:

1. **An `agent` field on `defineRpcFunction`** opts a function in.
2. **`ctx.agent`** registers tools not backed by an RPC and exposes readable resources.
3. **The MCP adapter** (`devframe/adapters/mcp`) serves the agent host as an [MCP](https://modelcontextprotocol.io) server.

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

Agent tools take one object input; prefer `args: [v.object({ ... })]`.

## Tool ids and wire names

Every agent tool has two names:

- **The id** — used to register and invoke in devframe. Colon-namespaced: `devframes:plugin:<slug>:<fn>` for plugin RPCs, `devframe:<area>:<fn>` for built-ins, command ids for hub-command tools.
- **The wire name** — what MCP clients call, constrained to `^[a-zA-Z0-9_-]{1,128}$`. The adapter derives it: each run outside that set becomes one `_`, truncated to 128 chars.

```
devframe:state:read          → devframe_state_read
devframes:plugin:git:status  → devframes_plugin_git_status
my-plugin:summarize          → my-plugin_summarize
```

Register with namespaced ids; `toAgentToolName` (`devframe/utils/agent-tool-name`, client-safe) predicts a wire name. Two ids that sanitize alike keep the first registration, hiding the later with `DF0047`.

## Registering a plugin tool

Tools without a matching RPC register directly:

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

Register a **provider** for tools derived from state you already maintain — queried at list/invoke time, so it stays the only copy:

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

Readable state snapshots, by URI:

```ts
ctx.agent.registerResource({
  id: 'current-session',
  name: 'Current Rolldown session',
  description: 'Markdown snapshot of the active build session.',
  mimeType: 'text/markdown',
  read: () => ({ text: renderMarkdown(currentSession) }),
})
```

Every `ctx.rpc.sharedState` key is exposed as a `devframe://state/<key>` resource and via the built-in **`devframe:state:read` tool** (wire name `devframe_state_read`) — no args for the key list, a `key` for that value. Pass `exposeSharedState: false` (or a filter) to `createMcpServer` to opt out.

## Starting the MCP server

Via the CLI:

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

Add to `claude_desktop_config.json`:

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

Restart Claude Desktop; flagged tools and `registerTool` calls appear in the tool drawer, resources as `devframe://resource/<id>` and `devframe://state/<key>` URIs.

## Writing descriptions agents act on

A tool description is a prompt: state when to reach for the tool, not just what it returns:

<!-- eslint-skip -->

```ts
// ✗ Bad: describes the mechanism
agent: { description: 'Returns the session summary object.' }
// ✓ Good: tells the agent when and why
agent: { description: 'Summarize the current build session — durations, chunk counts, warnings. Call this before proposing any build-config change.' }
```

## Gateway tools

A gateway tool returns *instructions and locations* instead of work the agent does better directly:

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

A coded diagnostic thrown from a handler crosses the MCP boundary as structured JSON:

```json
{ "error": { "code": "DF0017", "message": "…", "fix": "…", "docs": "https://devfra.me/errors/df0017" } }
```

Prefer coded diagnostics from anything agent-reachable — agents act on `fix` and follow `docs`.

## Safety model

- **`safety`** — one of `'read'`, `'action'`, `'destructive'`. Inferred from the RPC `type` (`static`/`query` → `read`, `action`/`event` → `action`), overridable.
- The adapter maps `safety` to tool annotations (`readOnlyHint`, `destructiveHint`) clients use to decide whether to prompt.

## CLI

| Command | Description |
|---------|-------------|
| `<your-app> mcp` | Start the MCP server on `stdio`. |
| `<your-app> dev --mcp` | Serve the agent surface on the `/__mcp` route. |
| `devframe connect` | Discover running devframes and proxy their tools — see [MCP adapter](/adapters/mcp#discovery-devframe-connect). |
