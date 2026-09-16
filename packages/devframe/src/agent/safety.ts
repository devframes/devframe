import type { RpcFunctionAgentOptions } from '../rpc/types'

/**
 * An agent tool's safety classification: the explicit `agent.safety`, else
 * inferred from the function `type` (`static`/`query` are read-only, the rest
 * mutate). Shared by every agent surface (MCP host, WebMCP, in-page bridge).
 */
export function resolveAgentSafety(
  type: string | undefined,
  agent: RpcFunctionAgentOptions,
): 'read' | 'action' | 'destructive' {
  if (agent.safety)
    return agent.safety
  return type === 'static' || type === 'query' || type == null ? 'read' : 'action'
}
