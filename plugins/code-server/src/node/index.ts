import type { DevframeNodeContext } from 'devframe/types'
import type { CodeServerOptions } from '../types'
import { serverFunctions } from '../rpc/index'
import { setCodeServerSupervisor } from './context'
import { CodeServerSupervisor } from './supervisor'

export type { CodeServerProfile, CodeServerProfileKind } from './backends'
export { resolveProfile } from './backends'
export * from './context'
export { detectCodeServer } from './detect'
export { diagnostics } from './diagnostics'
export { CodeServerSupervisor } from './supervisor'

/**
 * Wire the code-server subsystem onto a devframe node context: create the
 * {@link CodeServerSupervisor}, run the initial binary detection, publish
 * status into shared state, and register the control RPC functions. Returns
 * the supervisor so callers can launch/stop or dispose it on shutdown.
 *
 * Works in any devframe runtime (CLI, Vite, embedded, build) — it only relies
 * on the core `ctx.rpc` shared-state surface, not on the hub.
 */
export async function setupCodeServer(
  ctx: DevframeNodeContext,
  options: CodeServerOptions = {},
): Promise<CodeServerSupervisor> {
  const supervisor = new CodeServerSupervisor(ctx, options)
  setCodeServerSupervisor(ctx, supervisor)
  await supervisor.init()

  for (const fn of serverFunctions)
    ctx.rpc.register(fn)

  // Launch eagerly when asked, rather than waiting for the launcher's button.
  // Failures surface through shared state (status `error`); don't reject setup.
  if (options.startOnBoot)
    void supervisor.start().catch(() => {})

  return supervisor
}
