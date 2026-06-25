import type { DevframeNodeContext } from 'devframe/types'
import { createDefineWrapperWithContext } from 'devframe/rpc'

/**
 * `defineRpcFunction` pre-bound to the framework-neutral
 * {@link DevframeNodeContext}, so each inspector function's `setup(ctx)`
 * receives the typed node context (`ctx.rpc`, `ctx.agent`, …) instead of
 * the default `undefined` context.
 */
export const defineInspectRpc = createDefineWrapperWithContext<DevframeNodeContext>()
