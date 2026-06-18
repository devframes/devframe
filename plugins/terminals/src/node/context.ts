import type { DevframeNodeContext } from 'devframe/types'
import type { TerminalManager } from './manager'
import { diagnostics } from './diagnostics'

const managers = new WeakMap<DevframeNodeContext, TerminalManager>()

export function setTerminalManager(ctx: DevframeNodeContext, manager: TerminalManager): void {
  managers.set(ctx, manager)
}

export function getTerminalManager(ctx: DevframeNodeContext): TerminalManager {
  const manager = managers.get(ctx)
  if (!manager)
    throw diagnostics.DP_TERMINALS_0007({})
  return manager
}
