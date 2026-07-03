import type { DevframeMessagesHost } from '@devframes/hub/types'
import type { DevframeNodeContext } from 'devframe/types'
import { createDefineWrapperWithContext } from 'devframe/rpc'

/**
 * `defineRpcFunction` pre-bound to the framework-neutral
 * {@link DevframeNodeContext}, so each function's `setup(ctx)` receives the
 * typed node context instead of the default `undefined` context.
 */
export const defineMessagesRpc = createDefineWrapperWithContext<DevframeNodeContext>()

/**
 * Read the hub-attached messages host off a node context, if present. The
 * plugin talks to `ctx.messages` structurally so its shipped code carries no
 * runtime dependency on `@devframes/hub` — hosts other than the hub can
 * satisfy the same surface.
 */
export function getMessagesHost(ctx: DevframeNodeContext): DevframeMessagesHost | undefined {
  return (ctx as DevframeNodeContext & { messages?: DevframeMessagesHost }).messages
}
