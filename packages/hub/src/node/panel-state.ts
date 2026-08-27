import type { DevframeDockPanelState, DevframeDockPanelStateEvent, DevframeDocksHost } from '../types/docks'
import { HUB_EVENTS } from '../events'

const dockPanelStates = new WeakMap<DevframeDocksHost, Map<number, DevframeDockPanelState>>()

export function updateDockPanelState(
  docks: DevframeDocksHost,
  sessionId: number,
  panelState: DevframeDockPanelState,
): void {
  let sessionStates = dockPanelStates.get(docks)
  if (!sessionStates) {
    sessionStates = new Map()
    dockPanelStates.set(docks, sessionStates)
  }

  const previousState = sessionStates.get(sessionId)
  if (
    previousState?.state === panelState.state
    && previousState.selectedDockId === panelState.selectedDockId
  ) {
    return
  }

  const currentState: DevframeDockPanelState = {
    state: panelState.state,
    ...(panelState.selectedDockId !== undefined ? { selectedDockId: panelState.selectedDockId } : {}),
  }
  sessionStates.set(sessionId, currentState)
  const event: DevframeDockPanelStateEvent = previousState === undefined
    ? { type: 'connected', sessionId, ...currentState }
    : { type: 'changed', sessionId, ...currentState }
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
