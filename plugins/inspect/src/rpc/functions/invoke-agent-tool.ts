import type { InvokeResult } from '../../types'
import { defineInspectRpc } from './_define'

export const invokeAgentTool = defineInspectRpc({
  name: 'devframes-plugin-inspect:invoke-agent-tool',
  type: 'action',
  setup: ctx => ({
    handler: async (id: string, args: unknown): Promise<InvokeResult> => {
      const start = Date.now()
      try {
        const result = await ctx.agent.invoke(id, args)
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
