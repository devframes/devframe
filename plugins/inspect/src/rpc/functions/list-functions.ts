import type { RpcFunctionAgentInfo, RpcFunctionInfo } from '../../types'
import { defineInspectRpc } from './_define'
import { argsSchemaToJson, returnSchemaToJson } from './_schema'

const INVOKABLE_TYPES = new Set(['query', 'static'])

/**
 * Enumerate every RPC function registered on the connection, projecting
 * each definition's metadata into a JSON-safe {@link RpcFunctionInfo}.
 * `snapshot: true` bakes the registry into the static dump so the
 * inspector still lists functions in `build`/`spa` mode.
 */
export const listFunctions = defineInspectRpc({
  name: 'devframes:plugin:inspect:list-functions',
  type: 'query',
  jsonSerializable: true,
  snapshot: true,
  agent: {
    description: 'List every RPC function registered on this devframe connection, with metadata (name, type, JSON-serializable/snapshot flags, args/return schema, agent exposure). Read-only — the canonical way to discover what the running devframe can do.',
    title: 'List RPC functions',
  },
  setup: ctx => ({
    handler: async (): Promise<RpcFunctionInfo[]> => {
      const out: RpcFunctionInfo[] = []
      for (const [name, fn] of ctx.rpc.definitions) {
        const type = (fn.type ?? 'query') as RpcFunctionInfo['type']
        let agent: RpcFunctionAgentInfo | undefined
        if (fn.agent) {
          agent = {
            description: fn.agent.description,
            title: fn.agent.title,
            safety: fn.agent.safety,
            tags: fn.agent.tags,
          }
        }
        out.push({
          name,
          type,
          jsonSerializable: fn.jsonSerializable === true,
          snapshot: (fn as { snapshot?: boolean }).snapshot === true,
          cacheable: (fn as { cacheable?: boolean }).cacheable === true,
          hasArgs: !!fn.args,
          hasReturns: !!fn.returns,
          hasDump: !!fn.dump,
          hasSetup: !!fn.setup,
          hasHandler: !!fn.handler,
          invokable: INVOKABLE_TYPES.has(type),
          agent,
          argsSchema: argsSchemaToJson(fn.args as readonly unknown[] | undefined),
          returnsSchema: returnSchemaToJson(fn.returns),
        })
      }
      out.sort((a, b) => a.name.localeCompare(b.name))
      return out
    },
  }),
})
