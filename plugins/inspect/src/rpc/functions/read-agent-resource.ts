import type { InvokeResult } from '../../types'
import { defineInspectRpc } from './_define'

export const readAgentResource = defineInspectRpc({
  name: 'devframes-plugin-inspect:read-agent-resource',
  type: 'action',
  setup: ctx => ({
    handler: async (id: string): Promise<InvokeResult> => {
      const start = Date.now()
      try {
        const result = await ctx.agent.read(id)
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
