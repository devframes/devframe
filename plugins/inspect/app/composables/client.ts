import type { WebMcpModelContext, WebMcpRegisteredTool } from 'devframe/client'
import type { RpcFunctionsCollector } from 'devframe/rpc'
import type { InvokeResult, RpcFunctionInfo } from '../connect'
import { resolveWebMcpModelContext } from 'devframe/client'
import { getRpcHandler } from 'devframe/rpc'
import { toAgentToolName } from 'devframe/utils/agent-tool-name'
import { INVOKABLE_TYPES, projectRpcFunctionInfo } from '../../src/function-info'

/**
 * Project the browser side of the connection (the `rpc.client` collector)
 * into the same {@link RpcFunctionInfo} listing the Functions tab shows
 * for the node side.
 */
export function listClientFunctions<F, C>(clientRpc: RpcFunctionsCollector<F, C>): RpcFunctionInfo[] {
  const out: RpcFunctionInfo[] = []
  for (const [name, fn] of clientRpc.definitions)
    out.push(projectRpcFunctionInfo(name, fn))
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

/**
 * Invoke a client RPC function locally (in this page) and normalize the
 * outcome into the same {@link InvokeResult} envelope the node-side
 * `invoke` RPC returns. Gated to read-only `query`/`static` functions,
 * mirroring the node-side gate.
 */
export async function invokeClientFunction<F, C>(
  clientRpc: RpcFunctionsCollector<F, C>,
  name: string,
  args: unknown[],
): Promise<InvokeResult> {
  const def = clientRpc.definitions.get(name)
  if (!def)
    return { ok: false, error: { name: 'Error', message: `No client RPC function named "${name}" is registered.` }, durationMs: 0 }
  const type = def.type ?? 'query'
  if (!INVOKABLE_TYPES.has(type))
    return { ok: false, error: { name: 'Error', message: `"${name}" is a ${type} function; only read-only query/static functions are invoked.` }, durationMs: 0 }

  const start = Date.now()
  try {
    const handler = await getRpcHandler(def, clientRpc.context)
    const result = await handler(...args)
    return { ok: true, result, durationMs: Date.now() - start }
  }
  catch (error) {
    return { ok: false, error: normalizeError(error), durationMs: Date.now() - start }
  }
}

/** A WebMCP tool listed on the Client tab; see {@link loadWebMcpState}. */
type ClientWebMcpTool = WebMcpRegisteredTool & {
  /** Internal id of the client RPC function backing this tool (projected listing only). */
  source?: string
}

export interface ClientWebMcpState {
  /** Whether the page provides a WebMCP model context. */
  available: boolean
  /**
   * `true` when the tools were read live from the model context's
   * `getTools()`; `false` when projected from `agent`-flagged client RPC
   * functions (what devframe registers via `registerWebMcpTools`).
   */
  live: boolean
  /** Whether tools can be executed through the model context. */
  executable: boolean
  tools: ClientWebMcpTool[]
}

/**
 * The page's WebMCP tool surface: live from the model context's
 * `getTools()` when the browser supports discovery, otherwise the local
 * projection of `agent`-flagged client RPC functions.
 */
export async function loadWebMcpState<F, C>(
  clientRpc: RpcFunctionsCollector<F, C>,
  modelContext: WebMcpModelContext | undefined = resolveWebMcpModelContext(),
): Promise<ClientWebMcpState> {
  if (modelContext?.getTools) {
    try {
      const tools = (await modelContext.getTools()).map(tool => ({
        ...tool,
        /** Chromium's current build reports the schema as a JSON string. */
        inputSchema: parseMaybeJson(tool.inputSchema),
      }))
      return { available: true, live: true, executable: typeof modelContext.executeTool === 'function', tools }
    }
    catch {
      // Discovery denied (permissions policy); fall through to the projection.
    }
  }
  const tools: ClientWebMcpTool[] = []
  for (const [name, def] of clientRpc.definitions) {
    if (!def.agent)
      continue
    tools.push({ name: toAgentToolName(name), description: def.agent.description, source: name })
  }
  tools.sort((a, b) => a.name.localeCompare(b.name))
  return { available: !!modelContext, live: false, executable: false, tools }
}

/**
 * Execute a WebMCP tool through the model context, normalized into the
 * inspector's {@link InvokeResult} envelope.
 */
export async function executeWebMcpTool(
  modelContext: WebMcpModelContext,
  tool: WebMcpRegisteredTool,
  args: Record<string, unknown>,
): Promise<InvokeResult> {
  const start = Date.now()
  try {
    if (!modelContext.executeTool)
      throw new Error('This model context does not support executeTool().')
    let result: unknown
    try {
      // Chromium's current build carries args as a JSON string; a
      // spec-shaped (dictionary) implementation rejects the string during
      // argument conversion, before the tool runs, so retrying with the
      // object is side-effect free.
      result = await modelContext.executeTool(tool, JSON.stringify(args))
    }
    catch (error) {
      if (!(error instanceof TypeError))
        throw error
      result = await modelContext.executeTool(tool, args)
    }
    return { ok: true, result: parseMaybeJson(result), durationMs: Date.now() - start }
  }
  catch (error) {
    return { ok: false, error: normalizeError(error), durationMs: Date.now() - start }
  }
}

/** JSON-decode the string payloads Chromium's WebMCP build hands back. */
function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string')
    return value
  try {
    return JSON.parse(value)
  }
  catch {
    return value
  }
}

function normalizeError(error: unknown): NonNullable<InvokeResult['error']> {
  const e = error as Error
  return {
    name: e?.name ?? 'Error',
    message: e?.message ?? String(error),
    stack: e?.stack,
  }
}
