import type { DevframeNodeContext } from 'devframe/types'
import type { TerminalsOptions } from '../types'
import { serverFunctions } from '../rpc/index'
import { setTerminalManager } from './context'
import { TerminalManager } from './manager'

export { isPtyAvailable } from './backend'
export * from './context'
export { diagnostics } from './diagnostics'
export { TerminalManager } from './manager'

/**
 * Wire the terminals subsystem onto a devframe node context: create the
 * {@link TerminalManager}, publish presets + the session list into shared
 * state, and register the control RPC functions. Returns the manager so
 * callers can spawn sessions or dispose it on shutdown.
 *
 * Works in any devframe runtime (CLI, Vite, build) — it only depends on the
 * core `ctx.rpc` streaming + shared-state surface, not on the hub.
 */
export async function setupTerminals(
  ctx: DevframeNodeContext,
  options: TerminalsOptions = {},
): Promise<TerminalManager> {
  const manager = new TerminalManager(ctx, options)
  setTerminalManager(ctx, manager)
  await manager.init()

  for (const fn of serverFunctions)
    ctx.rpc.register(fn)

  return manager
}
