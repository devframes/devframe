import type { DevframeNodeContext } from 'devframe/types'
import type { A11yRuntimeConfig } from '../rpc/functions/get-config.ts'
import { buildServerFunctions, serverFunctions } from '../rpc/index.ts'

/**
 * Register the a11y inspector's RPC functions on a devframe node context.
 * Called from the definition's `setup(ctx)` and reusable by host adapters
 * that wire their own context. Author options (auto-scan, logging, axe tags,
 * default-highlight) are surfaced through the `get-config` function.
 */
export function setupA11y(ctx: DevframeNodeContext, options: A11yRuntimeConfig = {}): void {
  for (const fn of buildServerFunctions(options))
    ctx.rpc.register(fn)
}

export { serverFunctions }
