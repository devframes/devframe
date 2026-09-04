import type { DevframeMessagesHost } from '@devframes/hub/types'
import type { DevframeNodeContext } from 'devframe'

/**
 * Read the hub-attached messages host off a node context, if present. The
 * plugin talks to `ctx.messages` structurally so its shipped code carries no
 * runtime dependency on `@devframes/hub`, so hosts other than the hub can
 * satisfy the same surface.
 */
export function getMessagesHost(ctx: DevframeNodeContext): DevframeMessagesHost | undefined {
  return (ctx as DevframeNodeContext & { messages?: DevframeMessagesHost }).messages
}
