import type { DevframeDockPanelStateEvent, DevframeDocksHost } from '../types/docks'
import { HUB_EVENTS } from '../events'

const dockPanelStates = new WeakMap<DevframeDocksHost, Map<number, boolean>>()

export function updateDockPanelState(
  docks: DevframeDocksHost,
  sessionId: number,
  open: boolean,
): void {
  let sessionStates = dockPanelStates.get(docks)
  if (!sessionStates) {
    sessionStates = new Map()
    dockPanelStates.set(docks, sessionStates)
  }

  const previousOpen = sessionStates.get(sessionId)
  if (previousOpen === open)
    return

  sessionStates.set(sessionId, open)
  const event: DevframeDockPanelStateEvent = previousOpen === undefined
    ? { type: 'connected', sessionId, open }
    : { type: 'changed', sessionId, open }
  docks.events.emit(HUB_EVENTS.bus.docksPanelState, event)
}

export function disconnectDockPanelState(
  docks: DevframeDocksHost,
  sessionId: number,
): void {
  const sessionStates = dockPanelStates.get(docks)
  if (!sessionStates?.delete(sessionId))
    return

  docks.events.emit(HUB_EVENTS.bus.docksPanelState, { type: 'disconnected', sessionId })
  if (sessionStates.size === 0)
    dockPanelStates.delete(docks)
}
