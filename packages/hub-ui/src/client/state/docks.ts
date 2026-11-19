import type { DevframeDockEntry } from '@devframes/hub'
import type { DevframeRpcClient, DockEntryState, DockEntryStateEvents, DockPanelStorage, DocksContext, DockSessionStorage } from '@devframes/hub/client'
import type { SharedState } from 'devframe/utils/shared-state'
import type { Ref, ShallowRef } from 'vue'
import { createEventEmitter } from 'devframe/utils/events'
import { markRaw, reactive, shallowRef, watch } from 'vue'

/**
 * The id of the dock whose view is shown now, which the dock marks
 * `aria-current`: none for an action, and none while the panel of an
 * embedded dock is closed.
 */
export function getCurrentDockId(context: DocksContext): string | undefined {
  const entry = context.docks.selected
  if (!entry || entry.type === 'action')
    return undefined
  if (context.clientType === 'embedded' && !context.panel.session.open)
    return undefined
  return entry.id
}

/**
 * Whether `entry` is the current dock, or a group whose member is the
 * current dock and has no button of its own on the dock bar (a pinned or
 * recent button), so the group button stands in for it. `currentId` is
 * {@link getCurrentDockId}.
 */
export function holdsCurrentDock(context: DocksContext, entry: DevframeDockEntry, currentId: string | undefined): boolean {
  if (!currentId)
    return false
  if (entry.id === currentId)
    return true
  return entry.type === 'group'
    && context.docks.entries.find(e => e.id === currentId)?.groupId === entry.id
    && !hasOwnDockButton(context, currentId)
}

/** Whether the dock has its own button on the dock bar: pinned out of its group, or raised as a recent dock. */
function hasOwnDockButton(context: DocksContext, id: string): boolean {
  const session = context.panel.session
  const recentIds = session.recentDockIds ?? (session.recentDockId
    ? [session.recentDockId]
    : [])
  return recentIds.includes(id)
    || context.docks.groupedEntries.some(([, items]) => items.some(entry => entry.id === id))
}

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
 * The per-tab session UI state seed: `open`/`selectedDockId`/`selectedDockRoute`. Persisted to
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
    recentDockIds: [],
    groupLastChildIds: {},
  }
}

export function createDockEntryState(
  entry: DevframeDockEntry,
  selected: Ref<DevframeDockEntry | null>,
  /** Toggle actions that are on. Their own activation emits the entry events. */
  activeActions: ReadonlySet<string> = new Set(),
): DockEntryState {
  const events = createEventEmitter<DockEntryStateEvents>()
  const state: DockEntryState = reactive({
    entryMeta: entry,
    get isActive() {
      return selected.value?.id === entry.id || activeActions.has(entry.id)
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
      // A toggle action that is on stays on across selection changes it didn't cause.
      else if (!activeActions.has(entry.id)) {
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

export function waitForInitialSharedStateSync<Value extends object>(
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
