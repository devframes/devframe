import type { InvokeResult } from '../../types'
import { diagnostics } from '../../diagnostics'
import { defineInspectRpc } from './_define'
import { toInvokeResult } from './_invoke-result'

const INVOKABLE_TYPES = new Set(['query', 'static'])

/**
 * Invoke a read-only RPC function by name and return a result envelope.
 *
 * Deliberately gated to `query` / `static` functions — `action` and
 * `event` functions may carry side effects, so the inspector refuses to
 * fire them (`DP_INSPECT_0002`). Uses structured-clone serialization
 * (default) so arbitrary return values round-trip without the strict-JSON
 * constraints that `jsonSerializable: true` would impose.
 */
export const invoke = defineInspectRpc({
  name: 'devframes:plugin:inspect:invoke',
  type: 'action',
  setup: ctx => ({
    handler: async (name: string, args: unknown[] = []): Promise<InvokeResult> => {
      const def = ctx.rpc.definitions.get(name)
      if (!def)
        throw diagnostics.DP_INSPECT_0001({ name })

      const type = def.type ?? 'query'
      if (!INVOKABLE_TYPES.has(type))
        throw diagnostics.DP_INSPECT_0002({ name, type })

      return toInvokeResult(() => ctx.rpc.invokeLocal(name as any, ...(args as any)))
    },
  }),
})
