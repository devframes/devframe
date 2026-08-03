/**
 * Maximum tool-name length several MCP clients enforce (the Anthropic API
 * pattern is `^[a-zA-Z0-9_-]{1,128}$`).
 */
const MAX_TOOL_NAME_LENGTH = 128

/**
 * Derive the wire-safe agent tool name for an internal tool id.
 *
 * Devframe tool ids are colon-namespaced — `devframe:<area>:<fn>` for
 * built-ins, `devframes:plugin:<slug>:<fn>` for plugin RPCs, and hub
 * command ids for command-derived tools. MCP clients constrain tool names
 * to `^[a-zA-Z0-9_-]{1,128}$`, so the agent/MCP boundary derives the wire
 * name automatically: every run of characters outside `[a-zA-Z0-9_-]`
 * becomes a single `_`, truncated to 128 characters. Internal ids never
 * change — resolution back to the id happens at the boundary.
 *
 * ```
 * devframe:state:read          → devframe_state_read
 * devframes:plugin:git:status  → devframes_plugin_git_status
 * ```
 *
 * A plain string transform with no node dependency, so browser-side UIs
 * that display a tool's id (e.g. the inspect plugin's agent view) can
 * import it too and show the name a client actually calls.
 *
 * @experimental The agent-native surface is experimental and may change
 * without a major version bump until it stabilizes.
 */
export function toAgentToolName(id: string): string {
  return id.replace(/[^\w-]+/g, '_').slice(0, MAX_TOOL_NAME_LENGTH)
}
