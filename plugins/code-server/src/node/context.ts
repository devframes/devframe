import type { DevframeNodeContext } from 'devframe/types'
import type { CodeServerSupervisor } from './supervisor'
import { diagnostics } from './diagnostics'

const supervisors = new WeakMap<DevframeNodeContext, CodeServerSupervisor>()

export function setCodeServerSupervisor(ctx: DevframeNodeContext, supervisor: CodeServerSupervisor): void {
  supervisors.set(ctx, supervisor)
}

export function getCodeServerSupervisor(ctx: DevframeNodeContext): CodeServerSupervisor {
  const supervisor = supervisors.get(ctx)
  if (!supervisor)
    throw diagnostics.DP_CODE_SERVER_0004({})
  return supervisor
}
