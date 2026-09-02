import type { InvokeResult } from '../../types'
import { diagnostics } from '../../diagnostics'
import { defineInspectRpc } from './_define'
import { resolveHubCommands } from './_hub-commands'
import { toInvokeResult } from './_invoke-result'

/**
 * Execute a hub command by id and return a result envelope, mirroring
 * `devframes:plugin:inspect:invoke`. Unlike that function, this one is not
 * gated to read-only types — a command is, by construction, something a
 * user explicitly runs (unlike an arbitrary RPC `action`, which may be a
 * side effect the inspector shouldn't fire unprompted).
 *
 * Throws `DP_INSPECT_0003` when this connection has no hub commands host
 * (not mounted inside `@devframes/hub`). A found-but-unregistered id, or a
 * group-only command with no handler, surfaces as `{ ok: false, error }`
 * from the hub's own `commands.execute()` instead of throwing.
 */
export const executeCommand = defineInspectRpc({
  name: 'devframes:plugin:inspect:execute-command',
  type: 'action',
  setup: ctx => ({
    handler: async (id: string, args: unknown[] = []): Promise<InvokeResult> => {
      const host = resolveHubCommands(ctx)
      if (!host)
        throw diagnostics.DP_INSPECT_0003({ id })

      return toInvokeResult(() => host.execute(id, ...args))
    },
  }),
})
