---
outline: deep
---

# Agent-Native Devframe

::: warning Experimental
The agent-native surface (`agent` field on `defineRpcFunction`, `DevframeAgentHost`, and the `devframe/adapters/mcp` adapter) is experimental and may change without a major version bump until it stabilizes.
:::

Devframe can expose the same surface a browser UI consumes — RPC functions, resources, and shared state — to coding agents (Claude Desktop / Cursor / Zed / Claude Code, or any MCP-speaking client). Agent exposure is opt-in per function; functions stay private by default.

## How it works

Three building blocks:

1. **An `agent` field on `defineRpcFunction`.** Add `agent: { description, ... }` to opt a function in. Functions without the field stay private.
2. **`ctx.agent`** — a host exposed on `DevframeNodeContext`. Plugins register tools that aren't backed by an RPC, and expose readable resources (e.g. a Markdown build summary).
3. **The MCP adapter** (`devframe/adapters/mcp`) — translates the agent host into a [Model Context Protocol](https://modelcontextprotocol.io) server, over `stdio` (`devframe mcp`) or as a Streamable-HTTP route on the dev server (`--mcp`, advertised in `__connection.json`).

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

Agent tools take a single object input. The MCP adapter synthesises `arg0`, `arg1`, … from positional args (`args: [A, B]`); a single object schema (`args: [v.object({ ... })]`) reads better at the agent boundary because property names are self-describing.

## Tool ids and wire names

Every agent tool has two names:

- **The id** — how the tool is registered and invoked inside devframe. Ids are colon-namespaced by convention: `devframes:plugin:<slug>:<fn>` for plugin RPCs, `devframe:<area>:<fn>` for built-ins, and command ids for hub-command-derived tools.
- **The wire name** — what MCP clients see and call. Clients constrain tool names to `^[a-zA-Z0-9_-]{1,128}$`, so the MCP adapter derives the wire name automatically: every run of characters outside `[a-zA-Z0-9_-]` becomes a single `_`, truncated to 128 characters.

```
devframe:state:read          → devframe_state_read
devframes:plugin:git:status  → devframes_plugin_git_status
my-plugin:summarize          → my-plugin_summarize
```

The convention applies uniformly to `agent`-flagged RPCs, tools registered via `registerTool` / `registerToolProvider`, and the hub's command-derived tools — keep registering with namespaced ids and let the boundary derive the name. `toAgentToolName` (from `devframe/node`) computes the mapping when you need to predict a wire name (e.g. in a client config or a test). Calls resolve back to the id at the boundary; two ids that sanitize to the same wire name keep the first registration and hide the later one with a `DF0047` warning.

## Registering a plugin tool

For tools without a matching RPC — say, an on-demand narrative summary — register them directly:

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

When tools derive from state you already maintain — a command registry, a plugin catalog — register a **provider** instead of mirroring registrations. The host queries it at list/invoke time (the same lazy projection it applies to `agent`-flagged RPCs), so your source of truth stays the only copy:

```ts
const handle = ctx.agent.registerToolProvider(() =>
  currentCommands()
    .filter(command => command.agent)
    .map(command => toAgentTool(command)),
)

// After the underlying state changes, nudge connected MCP clients:
handle.notifyChanged() // fires tools/list_changed
```

The hub's commands host uses exactly this to project agent-flagged palette commands.

## Registering a resource

Resources surface readable snapshots of state, identified by URI:

```ts
ctx.agent.registerResource({
  id: 'current-session',
  name: 'Current Rolldown session',
  description: 'Markdown snapshot of the active build session.',
  mimeType: 'text/markdown',
  read: () => ({ text: renderMarkdown(currentSession) }),
})
```

Every `ctx.rpc.sharedState` key is also automatically exposed to MCP as `devframe://state/<key>`. Pass `exposeSharedState: false` (or a filter function) to `createMcpServer` to opt out.

Shared state is additionally reachable through the built-in **`devframe:state:read` tool** (wire name `devframe_state_read`) — call it without arguments for the key list, with a `key` for that value — since many MCP clients only consume tools. It honors the same `exposeSharedState` filter as the resource projection.

## Starting the MCP server

The simplest path is the CLI:

```sh
# Run your devtool with an MCP stdio server attached.
devframe mcp
```

Programmatic equivalent:

```ts
import { defineDevframe } from 'devframe'
import { createMcpServer } from 'devframe/adapters/mcp'

const devframe = defineDevframe({ /* … */ })

await createMcpServer(devframe, { transport: 'stdio' })
```

`@modelcontextprotocol/server` is a peer dependency — add it to your package when you want to ship an MCP-enabled devframe.

## Connecting Claude Desktop

Add an entry to `claude_desktop_config.json`:

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

Restart Claude Desktop. The tools you flagged with `agent: { ... }` (plus any `registerTool` calls) show up in the MCP tool drawer. Resources are reachable as `devframe://resource/<id>` and `devframe://state/<key>` URIs.

## Writing descriptions agents act on

A tool description is a prompt, not documentation. The agent decides *when* to call your tool from the description alone, so tell it — state when to reach for the tool, not just what it returns:

<!-- eslint-skip -->

```ts
// ✗ Bad: describes the mechanism
agent: { description: 'Returns the session summary object.' }
// ✓ Good: tells the agent when and why
agent: { description: 'Summarize the current build session — durations, chunk counts, warnings. Call this before proposing any build-config change.' }
```

Two conventions:

- **Lead with the action and the trigger.** "Call this before/after/when …" steers proactive use; a bare noun phrase gets ignored.
- **State freshness and cost.** "Safe to call freely" / "expensive, call once per session" lets the agent budget calls.

## Gateway tools

A gateway tool returns *instructions and locations* instead of doing the work — the pattern for anything the agent can do better directly (reading bundled docs, running a CLI it has shell access to):

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

The agent gets a path and a next step; the actual reading happens with its own tools, which are faster and keep large content out of the MCP payload.

## Structured errors

A coded devframe diagnostic thrown from a tool handler crosses the MCP boundary as structured JSON rather than a flattened message:

```json
{ "error": { "code": "DF0017", "message": "…", "fix": "…", "docs": "https://devfra.me/errors/df0017" } }
```

Agents can act on `fix` directly and follow `docs` for detail — prefer throwing coded diagnostics from anything agent-reachable.

## Safety model

- **Opt-in exposure.** Functions opt in via the `agent` field; everything else stays private.
- **`safety`** — one of `'read'`, `'action'`, `'destructive'`. Inferred from the RPC `type` (`static`/`query` → `read`, `action`/`event` → `action`), with explicit override available.
- The MCP adapter maps `safety` to tool annotations (`readOnlyHint`, `destructiveHint`). MCP clients use these to decide whether to prompt for confirmation before calling.

## CLI

| Command | Description |
|---------|-------------|
| `<your-app> mcp` | Start your app's MCP server on `stdio` (from the `createCac` shell). |
| `<your-app> dev --mcp` | Serve the agent surface on the dev server's `/__mcp` route. |
| `devframe connect` | Run the app-independent MCP connector: discover running devframes and proxy their tools — see [MCP adapter](/adapters/mcp#discovery-devframe-connect). |
