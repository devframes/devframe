import type { InvokeResult } from '../../types'
import { diagnostics } from '../../diagnostics'
import { defineInspectRpc } from './_define'

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
  name: 'devframes-plugin-inspect:invoke',
  type: 'action',
  setup: ctx => ({
    handler: async (name: string, args: unknown[] = []): Promise<InvokeResult> => {
      const def = ctx.rpc.definitions.get(name)
      if (!def)
        throw diagnostics.DP_INSPECT_0001({ name })

      const type = def.type ?? 'query'
      if (!INVOKABLE_TYPES.has(type))
        throw diagnostics.DP_INSPECT_0002({ name, type })

      const start = Date.now()
      try {
        const result = await ctx.rpc.invokeLocal(name as never, ...(args as never[]))
        return { ok: true, result, durationMs: Date.now() - start }
      }
      catch (error) {
        const e = error as Error
        return {
          ok: false,
          error: {
            name: e?.name ?? 'Error',
            message: e?.message ?? String(error),
            stack: e?.stack,
          },
          durationMs: Date.now() - start,
        }
      }
    },
  }),
})
