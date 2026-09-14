import type { RpcFunctionDefinitionAny } from './types'
import { diagnostics } from './diagnostics'

/**
 * Prevents using a coding-agent-exposed RPC function that is explicitly
 * marked as non-serializable, and marks these functions as serializable by
 * default.
 *
 * @internal
 */
export function ensureAgentJsonSerializable(fnDef: RpcFunctionDefinitionAny): void {
  if (fnDef.agent && fnDef.jsonSerializable === false)
    throw diagnostics.DF0019({ name: fnDef.name })
  if (fnDef.agent && !fnDef.jsonSerializable)
    fnDef.jsonSerializable = true
}
