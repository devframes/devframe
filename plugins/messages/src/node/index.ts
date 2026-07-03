import type { DevframeNodeContext } from 'devframe/types'
import { openHelpers } from 'devframe/recipes/open-helpers'
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

  for (const fn of serverFunctions)
    ctx.rpc.register(fn)

  // The detail panel's "open file" affordance uses devframe's prebuilt
  // `devframe:open-in-editor` recipe. Another tool on the same connection
  // may have registered the helpers already — skip those. The recipes are
  // context-free (`SetupContext = undefined`, plain handlers); widening to
  // the node collector's context is safe.
  for (const fn of openHelpers) {
    if (!ctx.rpc.definitions.has(fn.name))
      ctx.rpc.register(fn as unknown as Parameters<typeof ctx.rpc.register>[0])
  }
}

export { serverFunctions }
