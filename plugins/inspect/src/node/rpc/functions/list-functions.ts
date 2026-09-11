import type { RpcFunctionInfo } from '../../types'
import { defineRpcFunction } from 'devframe'
import { projectRpcFunctionInfo } from '../../../function-info'

/**
 * Enumerate every RPC function registered on the connection, projecting
 * each definition's metadata into a JSON-safe {@link RpcFunctionInfo}.
 * `snapshot: true` bakes the registry into the static dump so the
 * inspector still lists functions in `build`/`spa` mode.
 */
export const listFunctions = defineRpcFunction({
  name: 'devframes:plugin:inspect:list-functions',
  type: 'query',
  jsonSerializable: true,
  snapshot: true,
  agent: {
    description: 'List every RPC function registered on this devframe connection, with metadata (name, type, JSON-serializable/snapshot flags, args/return schema, agent exposure). Read-only, the canonical way to discover what the running devframe can do.',
    title: 'List RPC functions',
  },
  setup: ctx => ({
    handler: async (): Promise<RpcFunctionInfo[]> => {
      const out: RpcFunctionInfo[] = []
      for (const [name, fn] of ctx.rpc.definitions)
        out.push(projectRpcFunctionInfo(name, fn))
      out.sort((a, b) => a.name.localeCompare(b.name))
      return out
    },
  }),
})
