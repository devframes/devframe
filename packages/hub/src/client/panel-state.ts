import type { DevframeRpcClient } from 'devframe/client'
import type { DevframeDockPanelState } from '../types/docks'
import { HUB_EVENTS } from '../events'

/** Report this RPC connection's current dock-panel state to the hub. */
export async function reportDockPanelState(
  rpc: DevframeRpcClient,
  panelState: DevframeDockPanelState,
): Promise<void> {
  await rpc.call(HUB_EVENTS.rpc.docksPanelState, panelState)
}
