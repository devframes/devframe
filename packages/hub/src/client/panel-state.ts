import type { DevframeRpcClient } from 'devframe/client'
import { HUB_EVENTS } from '../events'

/** Report this RPC connection's current dock-panel state to the hub. */
export async function reportDockPanelState(
  rpc: DevframeRpcClient,
  open: boolean,
): Promise<void> {
  await rpc.call(HUB_EVENTS.rpc.docksPanelState, open)
}
