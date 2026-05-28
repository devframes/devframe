import type { RpcFunctionDefinitionAny } from 'devframe/rpc'
import { defineHubRpcFunction } from '../define'

/**
 * `hub:commands:execute` — Invoke a registered server command by id. The
 * arguments after `id` are forwarded to the command's `handler(...)`.
 * Returns whatever the handler returns.
 *
 * Pairs with the `devframe:commands` shared state: clients read the list
 * from the shared state and dispatch by id via this RPC.
 */
export const hubCommandsExecute = defineHubRpcFunction({
  name: 'hub:commands:execute',
  type: 'action',
  setup: context => ({
    async handler(id: string, ...args: any[]) {
      return context.commands.execute(id, ...args)
    },
  }),
})

/**
 * Framework-neutral RPC declarations auto-registered by
 * {@link createHubContext}. Provide additional RPCs by passing your own
 * array via `CreateHubContextOptions.builtinRpcDeclarations`; the hub's
 * list is prepended automatically.
 */
export const builtinHubRpcDeclarations: readonly RpcFunctionDefinitionAny[] = [
  hubCommandsExecute,
]
