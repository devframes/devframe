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
 * The per-tab session UI state seed — `open`/`selectedDockId`/`selectedDockRoute`. Persisted to
 * `sessionStorage` by the embedded and standalone bootstraps so a reload (and
 * the RPC auth handshake that follows one) restores the panel to the dock and
 * route the developer left open. Distinct from {@link DEFAULT_DOCK_PANEL_STORE}
 * (browser-shared `localStorage` geometry), because selection is per-tab.
 */
export function DEFAULT_DOCK_SESSION_STORE(): DockSessionStorage {
  return {
    open: false,
    selectedDockId: null,
    selectedDockRoute: null,
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

export function waitForInitialSharedStateSync<Value>(
  sharedState: SharedState<Value>,
  pendingValue: Value,
): Promise<void> {
  if (sharedState.value() !== pendingValue)
    return Promise.resolve()

  return new Promise<void>((resolve) => {
    const stopListening = sharedState.on('updated', () => {
      stopListening()
      resolve()
    })
  })
}

interface DocksEntriesState {
  entries: ShallowRef<DevframeDockEntry[]>
  initialSyncComplete: Promise<void>
}

const docksEntriesStateByRpc = new WeakMap<DevframeRpcClient, DocksEntriesState>()
export async function useDocksEntries(rpc: DevframeRpcClient): Promise<DocksEntriesState> {
  if (docksEntriesStateByRpc.has(rpc)) {
    return docksEntriesStateByRpc.get(rpc)!
  }

  /** Identity marker replaced by the first server response, including an empty registry. */
  const pendingEntries: DevframeDockEntry[] = []
  const state = await rpc.sharedState.get('devframe:docks', { initialValue: pendingEntries })
  const entries = sharedStateToRef(state)
  const initialSyncComplete = waitForInitialSharedStateSync(state, pendingEntries)
  const docksEntriesState = { entries, initialSyncComplete }
  docksEntriesStateByRpc.set(rpc, docksEntriesState)
  return docksEntriesState
}
