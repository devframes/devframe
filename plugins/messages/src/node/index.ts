import type { DevframeNodeContext } from 'devframe'
import { PLUGIN_ID } from '../constants'
import { diagnostics } from '../diagnostics'
import { getMessagesHost } from '../rpc/functions/_define'
import { serverFunctions } from '../rpc/index'

/**
 * Register the message-feed RPC functions on a devframe node context.
 * Called from the definition's `setup(ctx)` and reusable by host adapters
 * that wire their own context.
 *
 * The plugin reads the feed from the hub-attached `ctx.messages` host. On a
 * plain (non-hub) context it warns once and keeps the RPC surface registered
 * as no-ops, so the panel still renders — with an empty feed.
 */
export function setupMessages(ctx: DevframeNodeContext): void {
  if (!getMessagesHost(ctx))
    diagnostics.DP_MESSAGES_0001({ id: PLUGIN_ID })

  // The detail panel's "open file" affordance delegates to the
  // `@devframes/service-open` wire service (declared in the definition's
  // `services`) through `devframes:plugin:messages:open-file`, which
  // resolves workspace-relative file positions server-side.
  for (const fn of serverFunctions)
    ctx.rpc.register(fn)
}

export { serverFunctions }
