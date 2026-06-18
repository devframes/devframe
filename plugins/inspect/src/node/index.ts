import type { DevframeNodeContext } from 'devframe/types'
import { serverFunctions } from '../rpc/index'

/**
 * Register the inspector's introspection RPC functions on a devframe
 * node context. Called from the definition's `setup(ctx)` and reusable
 * by host adapters that wire their own context.
 */
export function setupInspect(ctx: DevframeNodeContext): void {
  for (const fn of serverFunctions)
    ctx.rpc.register(fn)
}

export { serverFunctions }
