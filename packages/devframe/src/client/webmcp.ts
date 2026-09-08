import type { RpcFunctionAgentOptions, RpcFunctionDefinitionAnyWithContext, RpcFunctionsCollector, RpcFunctionType } from 'devframe/rpc'
import { getRpcHandler } from 'devframe/rpc'
import { toAgentToolName } from 'devframe/utils/agent-tool-name'
// Pure, browser-safe projections shared with the node-side MCP adapter, so
// the WebMCP surface cannot drift from the MCP one.
import { argsToJsonSchema } from '../adapters/mcp/to-json-schema'
import { coerceAgentPositionalArgs } from '../node/agent-args'

/**
 * Result a WebMCP tool's `execute` resolves with; mirrors the MCP
 * `CallToolResult` text shape the [WebMCP](https://github.com/webmachinelearning/webmcp)
 * proposal adopts.
 */
export interface WebMcpToolResult {
  content: { type: 'text', text: string }[]
  isError?: boolean
}

/** A tool descriptor as passed to {@link WebMcpModelContext.registerTool}. */
export interface WebMcpToolDescriptor {
  name: string
  description: string
  inputSchema?: unknown
  annotations?: {
    title?: string
    readOnlyHint?: boolean
    destructiveHint?: boolean
  }
  execute: (args: Record<string, unknown>) => Promise<WebMcpToolResult>
}

/**
 * A tool as reported by {@link WebMcpModelContext.getTools}: the
 * serializable descriptor fields plus the registering `origin`. The
 * browser may attach more members (e.g. the owner `window`); pass the
 * object through unchanged to {@link WebMcpModelContext.executeTool}.
 */
export interface WebMcpRegisteredTool {
  name: string
  description?: string
  inputSchema?: unknown
  origin?: string
}

/**
 * Structural subset of the experimental WebMCP model context
 * (`document.modelContext` / `navigator.modelContext`). The current draft
 * unregisters a tool by aborting the passed `AbortSignal` and returns a
 * promise; earlier drafts returned a handle with `unregister()`. Typed to
 * accept both generations. `getTools` / `executeTool` are the draft's
 * discovery/execution surface for in-page agents; absent on older drafts.
 */
export interface WebMcpModelContext {
  registerTool: (
    tool: WebMcpToolDescriptor,
    options?: { signal?: AbortSignal },
  ) => void | { unregister?: () => void } | Promise<unknown>
  getTools?: (options?: { fromOrigins?: string[] }) => Promise<WebMcpRegisteredTool[]>
  /**
   * The spec draft takes the args as a dictionary; Chromium's current
   * build takes (and returns) JSON strings instead, hence the union.
   */
  executeTool?: (
    tool: WebMcpRegisteredTool,
    args: Record<string, unknown> | string,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>
}

interface WebMcpModelContextCarrier {
  modelContext?: WebMcpModelContext
}

/**
 * The page's WebMCP model context, when the browser (or a polyfill)
 * provides one. Checks `document.modelContext` (current draft) first,
 * then `navigator.modelContext` (earlier drafts and polyfills).
 */
export function resolveWebMcpModelContext(): WebMcpModelContext | undefined {
  // WebMCP is experimental and absent from lib.dom, hence the carriers.
  if (typeof document !== 'undefined') {
    const context = (document as WebMcpModelContextCarrier).modelContext
    if (context)
      return context
  }
  if (typeof navigator !== 'undefined') {
    const context = (navigator as WebMcpModelContextCarrier).modelContext
    if (context)
      return context
  }
  return undefined
}

export interface RegisterWebMcpToolsOptions {
  /**
   * Model context to register tools on. Defaults to the one the page
   * provides (see {@link resolveWebMcpModelContext}); when neither is
   * given, registration is a no-op.
   */
  modelContext?: WebMcpModelContext
}

/**
 * Mirror the `agent`-flagged RPC functions of a browser-side collector
 * (`rpc.client`) onto the page's WebMCP model context as callable tools,
 * using the same `agent` signature, wire names, and `arg0`/`arg1`/… input
 * schema as the node-side MCP adapter. Functions without an `agent` field
 * stay unexposed (default-deny), and the tool set follows later
 * `register`/`update` calls. Returns a dispose that unregisters every tool.
 */
export function registerWebMcpTools<LocalFunctions, SetupContext>(
  clientRpc: RpcFunctionsCollector<LocalFunctions, SetupContext>,
  options: RegisterWebMcpToolsOptions = {},
): () => void {
  const resolved = options.modelContext ?? resolveWebMcpModelContext()
  if (!resolved)
    return () => {}
  const modelContext: WebMcpModelContext = resolved

  /** Unregister callbacks keyed by definition name. */
  const registered = new Map<string, () => void>()
  /** Wire name → definition name, to detect sanitization collisions. */
  const wireNames = new Map<string, string>()

  function register(def: RpcFunctionDefinitionAnyWithContext<SetupContext>, agent: RpcFunctionAgentOptions): void {
    const name = toAgentToolName(def.name)
    const owner = wireNames.get(name)
    if (owner && owner !== def.name) {
      console.warn(`[devframe] WebMCP tool name "${name}" (from "${def.name}") collides with "${owner}"; keeping the first registration.`)
      return
    }

    const controller = new AbortController()
    const result = modelContext.registerTool({
      name,
      description: agent.description,
      inputSchema: argsToJsonSchema(def.args),
      annotations: {
        title: agent.title ?? def.name,
        readOnlyHint: resolveSafety(def, agent) === 'read',
        destructiveHint: resolveSafety(def, agent) === 'destructive',
      },
      execute: args => executeRpcTool(def, clientRpc.context, args),
    }, { signal: controller.signal })
    // Registration may reject when the frame's permissions policy denies
    // `tools`; the surface is simply unavailable there.
    if (result && 'then' in result)
      void result.then(() => {}, () => {})

    wireNames.set(name, def.name)
    registered.set(def.name, () => {
      controller.abort()
      if (result && 'unregister' in result && typeof result.unregister === 'function')
        result.unregister()
      wireNames.delete(name)
    })
  }

  function sync(id?: string): void {
    const names = id ? [id] : [...clientRpc.definitions.keys()]
    for (const name of names) {
      registered.get(name)?.()
      registered.delete(name)
      const def = clientRpc.definitions.get(name)
      const agent = def?.agent as RpcFunctionAgentOptions | undefined
      if (def && agent)
        register(def, agent)
    }
  }

  sync()
  const unsubscribe = clientRpc.onChanged(id => sync(id))

  return () => {
    unsubscribe()
    for (const unregister of registered.values())
      unregister()
    registered.clear()
  }
}

function resolveSafety(
  def: RpcFunctionDefinitionAnyWithContext<any>,
  agent: RpcFunctionAgentOptions,
): 'read' | 'action' | 'destructive' {
  if (agent.safety)
    return agent.safety
  const type: RpcFunctionType = def.type ?? 'query'
  return type === 'static' || type === 'query' ? 'read' : 'action'
}

async function executeRpcTool<SetupContext>(
  def: RpcFunctionDefinitionAnyWithContext<SetupContext>,
  context: SetupContext,
  args: Record<string, unknown>,
): Promise<WebMcpToolResult> {
  try {
    const positional = coerceAgentPositionalArgs(args, def.args as readonly unknown[] | undefined, 'wrap')
    const handler = await getRpcHandler(def, context)
    const result = await handler(...positional)
    return { content: [{ type: 'text', text: stringifyResult(result) }] }
  }
  catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: formatError(error) }],
    }
  }
}

/**
 * Agent-exposed functions are strict-JSON by contract (`jsonSerializable:
 * true` is enforced at registration), so plain `JSON.stringify` suffices.
 */
function stringifyResult(value: unknown): string {
  if (value === undefined)
    return 'undefined'
  if (typeof value === 'string')
    return value
  return JSON.stringify(value, null, 2)
}

function formatError(error: unknown): string {
  if (!(error instanceof Error))
    return String(error)
  const cause = error.cause instanceof Error ? ` (cause: ${error.cause.message})` : ''
  return `${error.name}: ${error.message}${cause}`
}
