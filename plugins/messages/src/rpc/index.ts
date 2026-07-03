import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { messagesAdd } from './functions/add'
import { messagesClear } from './functions/clear'
import { messagesList } from './functions/list'
import { messagesRemove } from './functions/remove'
import { messagesUpdate } from './functions/update'

/**
 * The message-feed RPC functions registered by the plugin — thin, typed
 * wrappers over the hub's `ctx.messages` host. Namespaced
 * `devframes-plugin-messages:*` per the plugin convention.
 */
export const serverFunctions = [
  messagesList,
  messagesAdd,
  messagesUpdate,
  messagesRemove,
  messagesClear,
] as const

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
