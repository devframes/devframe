import type { DevframeDockEntry } from '@devframes/hub'
import type { DevframeRpcClient, DockEntryState, DockEntryStateEvents, DockPanelStorage, DockSessionStorage } from '@devframes/hub/client'
import type { SharedState } from 'devframe/utils/shared-state'
import type { Ref, ShallowRef } from 'vue'
import { createEventEmitter } from 'devframe/utils/events'
import { markRaw, reactive, shallowRef, watch } from 'vue'

export function DEFAULT_DOCK_PANEL_STORE(): DockPanelStorage {
  return {
    mode: 'float',
    width: 80,
    height: 80,
    top: 0,
    left: 10,
    position: 'bottom',
    inactiveTimeout: 3_000,
  }
}

/**
 * The per-tab session UI state seed — `open`/`selectedId`/`route`. Persisted to
 * `sessionStorage` by the embedded and standalone bootstraps so a reload (and
 * the RPC auth handshake that follows one) restores the panel to the dock and
 * route the developer left open. Distinct from {@link DEFAULT_DOCK_PANEL_STORE}
 * (browser-shared `localStorage` geometry), because selection is per-tab.
 */
export function DEFAULT_DOCK_SESSION_STORE(): DockSessionStorage {
  return {
    open: false,
    selectedId: null,
    route: null,
  }
}

export function createDockEntryState(
  entry: DevframeDockEntry,
  selected: Ref<DevframeDockEntry | null>,
): DockEntryState {
  const events = createEventEmitter<DockEntryStateEvents>()
  const state: DockEntryState = reactive({
    entryMeta: entry,
    get isActive() {
      return selected.value?.id === entry.id
    },
    domElements: {},
    events: markRaw(events),
  })

  watch(
    () => selected.value?.id,
    (newSelectedId) => {
      if (newSelectedId === entry.id) {
        events.emit('entry:activated')
      }
      else {
        events.emit('entry:deactivated')
      }
    },
    { immediate: true },
  )

  watch(
    () => state.domElements.iframe,
    (newIframe) => {
      if (newIframe)
        events.emit('dom:iframe:mounted', newIframe)
    },
    { immediate: true },
  )

  watch(
    () => state.domElements.panel,
    (newPanel) => {
      if (newPanel)
        events.emit('dom:panel:mounted', newPanel)
    },
    { immediate: true },
  )

  return state
}

export function sharedStateToRef<T>(sharedState: SharedState<T>): ShallowRef<T> {
  const ref = shallowRef<T>(sharedState.value() as T)
  sharedState.on('updated', (newState: T) => {
    ref.value = newState
  })
  return ref
}

const docksEntriesRefByRpc = new WeakMap<DevframeRpcClient, ShallowRef<DevframeDockEntry[]>>()
export async function useDocksEntries(rpc: DevframeRpcClient): Promise<Ref<DevframeDockEntry[]>> {
  if (docksEntriesRefByRpc.has(rpc)) {
    return docksEntriesRefByRpc.get(rpc)!
  }
  const state = await rpc.sharedState.get('devframe:docks', { initialValue: [] })
  const docksEntriesRef = sharedStateToRef(state)
  docksEntriesRefByRpc.set(rpc, docksEntriesRef)
  return docksEntriesRef
}
