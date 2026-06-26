import type { DevframeNodeContext } from 'devframe/types'
import { serverFunctions } from '../rpc/index.ts'

/**
 * Register the a11y inspector's RPC functions on a devframe node context.
 * Called from the definition's `setup(ctx)` and reusable by host adapters
 * that wire their own context.
 */
export function setupA11y(ctx: DevframeNodeContext): void {
  for (const fn of serverFunctions)
    ctx.rpc.register(fn)
}

export { serverFunctions }
