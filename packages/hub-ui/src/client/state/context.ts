import type { DevframeClientCommand, DevframeDockEntry, DevframeDockPanelState, DevframeDockUserEntry, DevframeRpcClientFunctions, DevframeViewIframe } from '@devframes/hub'
import type { CommandsContext, DevframeClientContext, DevframeRpcClient, DockClientScriptContext, DockEntryState, DockPanelStorage, DockRegistration, DockRendererManifest, DocksContext, DockSessionStorage, DocksPanelEvents } from '@devframes/hub/client'
import type { SharedState } from 'devframe/utils/shared-state'
import type { WhenContext } from 'devframe/utils/when'
import type { Ref } from 'vue'
import type { DevframeDocksUserSettings } from './dock-settings'
import { attachFrameNavClient, createDockRenderersContext } from '@devframes/hub/client'
import { DEFAULT_STATE_USER_SETTINGS, DOCK_RENDERERS_STATE_KEY, HUB_EVENTS } from '@devframes/hub/constants'
import { DEVFRAME_EVENTS } from 'devframe/constants'
import { createEventEmitter } from 'devframe/utils/events'
import { computed, markRaw, reactive, ref, toRefs, watch, watchEffect } from 'vue'
import { BUILTIN_ENTRIES, BUILTIN_ENTRY_SETTINGS, DEFAULT_CATEGORIES_ORDER, HUB_UI_HIDE_EVENT } from '../constants'
import { useBranding } from './branding'
import { createCommandsContext } from './commands'
import { docksGroupByCategories, getCategoryLabel, getGroupMembers, getGroupMembersGrouped, getRegisteredGroupIds, resolveCommandIcon, resolveGroupPreferredChild } from './dock-settings'
import { createDockEntryState, DEFAULT_DOCK_PANEL_STORE, DEFAULT_DOCK_SESSION_STORE, sharedStateToRef, useDocksEntries, waitForInitialSharedStateSync } from './docks'
import { createClientMessagesClient } from './messages-client'
import { registerMainFrameDockActionHandler, triggerMainFrameDockAction, useIsDockPopupOpen } from './popup'
import { executeSetupScript } from './setup-script'

const docksContextByRpc = new WeakMap<DevframeRpcClient, DocksContext>()

function createDockPanelState(
  visible: boolean,
  open: boolean,
  selectedDockId: string | null,
): DevframeDockPanelState {
  let state: DevframeDockPanelState['state']
  if (!visible)
    state = 'hidden'
  else if (open)
    state = 'open'
  else
    state = 'closed'

  const panelState: DevframeDockPanelState = { state }
  if (selectedDockId !== null)
    panelState.selectedDockId = selectedDockId
  return panelState
}

export async function createDocksContext(
  clientType: 'embedded' | 'standalone',
  rpc: DevframeRpcClient,
  panelStore?: Ref<DockPanelStorage>,
  sessionStore?: Ref<DockSessionStorage>,
  panelVisible: Ref<boolean | undefined> = ref(true),
): Promise<DocksContext> {
  if (docksContextByRpc.has(rpc)) {
    return docksContextByRpc.get(rpc)!
  }

  const { entries: dockEntries, initialSyncComplete: dockEntriesInitialSyncComplete } = await useDocksEntries(rpc)

  // The hub's renderer manifest (`initHub({ renderers })`): dock type →
  // prebuilt renderer-module entry. The registry below lazy-imports a module
  // the first time a dock of its type mounts; locally-registered renderers win.
  /** Identity marker replaced by the first server response, including an empty manifest. */
  const pendingRendererManifest: DockRendererManifest = {}
  const rendererManifestState = await rpc.sharedState.get<DockRendererManifest>(
    DOCK_RENDERERS_STATE_KEY,
    { initialValue: pendingRendererManifest },
  )
  const rendererManifest = sharedStateToRef(rendererManifestState)
  const rendererManifestInitialSyncComplete = waitForInitialSharedStateSync(
    rendererManifestState,
    pendingRendererManifest,
  )

  // Client-only dock registry (0.7.10 `DocksEntriesContext` API). Docks
  // registered here live in this page only, merged over the server-provided
  // `devframe:docks` docks by id, and never sync to shared state. Mirrors the
  // merge semantics of `@devframes/hub`'s own client host.
  const clientDocks = reactive(new Map<string, DevframeDockEntry>())
  const entries = computed<DevframeDockEntry[]>(() => {
    const server = dockEntries.value
    let base: DevframeDockEntry[]
    if (clientDocks.size === 0) {
      base = server
    }
    else {
      const seen = new Set<string>()
      const merged: DevframeDockEntry[] = []
      for (const entry of server) {
        seen.add(entry.id)
        // a client dock sharing a server id overrides it in the local merge
        merged.push(clientDocks.get(entry.id) ?? entry)
      }
      for (const [id, entry] of clientDocks) {
        if (!seen.has(id))
          merged.push(entry)
      }
      base = merged
    }
    // Surface the viewer's own built-in Settings tab by default. hub-ui owns it
    // rather than depending on a host to register `~settings` server-side, so
    // Settings is always reachable (dock bar + `devframes:open-settings`). A host
    // that registered its own `~settings` entry wins — we only add ours when the
    // merged list has none.
    if (base.some(entry => entry.id === BUILTIN_ENTRY_SETTINGS.id))
      return base
    return [...base, BUILTIN_ENTRY_SETTINGS]
  })

  // Per-tab session UI state (open/selectedId/route). A caller (the embedded and
  // standalone bootstraps) passes a `sessionStorage`-backed ref so it survives a
  // reload; stories and the default path fall back to an in-memory ref.
  sessionStore ||= ref(DEFAULT_DOCK_SESSION_STORE())

  // Snapshot the persisted intent up front, before the pre-handshake untrusted
  // window (Dock.vue's `open`-gate, a revocation `switchEntry(null)`) can clear
  // the live session state. Re-applied once the RPC becomes trusted so a reload
  // lands back on the same dock — see the restore effect near the end.
  const restoreIntent = {
    ...sessionStore.value,
  }
  /** Keep the persisted view unmounted until its server-backed registries are ready. */
  const initialRestorePending = ref(
    restoreIntent.open && restoreIntent.selectedDockId != null,
  )

  // `selectedDockId` is backed by the session store so the current selection both
  // drives the UI and persists across reloads through one source of truth.
  const selectedDockId = computed<string | null>({
    get: () => sessionStore.value.selectedDockId,
    set: (id) => {
      sessionStore.value.selectedDockId = id
    },
  })
  const selectedDockRoute = computed<string | null>({
    get: () => sessionStore.value.selectedDockRoute,
    set: (route) => {
      sessionStore.value.selectedDockRoute = route
    },
  })

  const selected = computed(() => {
    if (initialRestorePending.value)
      return null
    return entries.value.find(entry => entry.id === selectedDockId.value)
      ?? BUILTIN_ENTRIES.find(entry => entry.id === selectedDockId.value)
      ?? null
  })

  const dockEntryStateMap: Map<string, DockEntryState> = reactive(new Map())
  watchEffect(() => {
    for (const entry of entries.value) {
      if (dockEntryStateMap.has(entry.id)) {
        dockEntryStateMap.get(entry.id)!.entryMeta = entry
        continue
      }
      dockEntryStateMap.set(
        entry.id,
        createDockEntryState(entry, selected),
      )
    }
  })

  const registerClientDock = <T extends DevframeDockEntry>(entry: T, force = false): DockRegistration<T> => {
    if (clientDocks.has(entry.id) && !force)
      throw new Error(`[@devframes/hub-ui] a client dock "${entry.id}" is already registered — pass force to overwrite`)
    clientDocks.set(entry.id, entry)
    // Eagerly materialize the entry's DockEntryState. The reactive watchEffect
    // above only creates states on its next flush, but a caller such as the
    // shared-iframe frame-nav adapter subscribes to `entry:activated` (via
    // `getStateById`) synchronously right after registering — so the state has
    // to exist immediately, mirroring hub's synchronous client-host reconcile.
    if (!dockEntryStateMap.has(entry.id))
      dockEntryStateMap.set(entry.id, createDockEntryState(entry, selected))
    return {
      update: (patch: Partial<T>) => {
        if (patch.id != null && patch.id !== entry.id)
          throw new Error(`[@devframes/hub-ui] a client dock id is immutable ("${entry.id}")`)
        const existing = clientDocks.get(entry.id)
        if (existing)
          clientDocks.set(entry.id, { ...existing, ...patch } as DevframeDockEntry)
      },
      dispose: () => {
        if (!clientDocks.delete(entry.id))
          return
        dockEntryStateMap.delete(entry.id)
        // Clearing the selection when the active member vanishes matches the
        // hub reconcile behavior for a removed selected entry (shared-iframe
        // soft-nav §7.5).
        if (selectedDockId.value === entry.id)
          selectedDockId.value = null
      },
    }
  }
  const updateClientDock = (entry: DevframeDockUserEntry) => {
    if (!clientDocks.has(entry.id))
      throw new Error(`[@devframes/hub-ui] no client dock "${entry.id}" to update — register it first`)
    clientDocks.set(entry.id, entry as DevframeDockEntry)
  }

  panelStore ||= ref(DEFAULT_DOCK_PANEL_STORE())
  const panelEvents = createEventEmitter<DocksPanelEvents>()
  let docksContext: DocksContext

  let _settingsStorePromise: Promise<SharedState<DevframeDocksUserSettings>> | undefined
  const getSettingsStore = async () => {
    if (!_settingsStorePromise) {
      _settingsStorePromise = rpc.sharedState.get(
        'devframe:user-settings',
        { initialValue: DEFAULT_STATE_USER_SETTINGS() },
      )
    }
    return _settingsStorePromise
  }

  // Get settings store ahead of `switchEntry` — its group→member resolution
  // needs `getWhenContext` to honor a `defaultChildId` target's `when` clause.
  const settingsStore = markRaw(await getSettingsStore())
  // Raw, not `useSettings`: the context this would key off doesn't exist yet,
  // and the only consumers are the `dock-settings.ts` helpers below, which
  // resolve hub-ui's own defaults themselves.
  const settings = sharedStateToRef(settingsStore)

  // Shared when-context provider — used by both commands and docks
  let commandsContext: CommandsContext
  const isDockPopupOpen = useIsDockPopupOpen()
  const getWhenContext = (): WhenContext => ({
    clientType,
    dockOpen: sessionStore.value.open,
    paletteOpen: commandsContext?.paletteOpen ?? false,
    dockSelectedId: selectedDockId.value ?? '',
    popupOpen: isDockPopupOpen.value,
  })

  // Tracks the shared frame's current member tab, keyed by `frameId`. A
  // `subTabs` anchor boots a shared iframe but has no view distinct from its
  // synthesized member tabs (they all render the same frame), and it is usually
  // hidden from the bar via `visibility: 'false'`. Remembering which member is
  // live lets `switchEntry` redirect a later re-selection of the anchor (e.g. a
  // group `defaultChildId` reopening the group) onto that visible tab instead of
  // lingering on the invisible anchor. Populated below whenever a member is
  // selected; read when a `subTabs` anchor is selected.
  const frameNavCurrentMember = new Map<string, string>()

  const switchEntry = async (id: string | null = null) => {
    if (id == null) {
      initialRestorePending.value = false
      selectedDockId.value = null
      sessionStore.value.open = false
      sessionStore.value.selectedDockRoute = null
      return true
    }
    if (id === '~client-auth-notice') {
      initialRestorePending.value = false
      selectedDockId.value = id
      sessionStore.value.open = true
      return true
    }
    const entry = entries.value.find(e => e.id === id)
    if (!entry)
      return false

    // A group has no view of its own — resolve to the member it represents.
    // Prefer the member last opened in this group this tab, then the author's
    // `defaultChildId` (each honoring its `when` clause but ignoring its
    // render-only `visibility` — see `resolveGroupPreferredChild`), otherwise
    // the first member. With none, the group is popover-only and selecting it
    // is a no-op here (the dock-bar group button opens the member popover
    // instead).
    if (entry.type === 'group') {
      const target = resolveGroupPreferredChild(entries.value, entry, sessionStore.value.groupLastChildIds?.[entry.id], getWhenContext())?.id
        ?? getGroupMembers(entries.value, entry.id)[0]?.id
      if (!target)
        return false
      return switchEntry(target)
    }

    // A `subTabs` anchor owns the shared frame but has no view of its own apart
    // from its synthesized member tabs, and is usually hidden from the bar
    // (`visibility: 'false'`). Once the frame has reported a current tab,
    // selecting the anchor — via a group `defaultChildId` boot, the command
    // palette, or an RPC activation — redirects to that live member so a visible
    // dock is highlighted instead of the invisible anchor. Before any tab exists
    // (first boot) there is no current member, so we fall through and select the
    // anchor itself to mount its iframe and boot the frame.
    if (entry.type === 'iframe' && entry.subTabs) {
      const frameId = entry.frameId ?? entry.id
      const currentMemberId = frameNavCurrentMember.get(frameId)
      if (currentMemberId && currentMemberId !== id && entries.value.some(e => e.id === currentMemberId))
        return switchEntry(currentMemberId)
    }

    // If the action is in a popup, delegate to the main frame
    if (entry.type === 'action') {
      const delegated = await triggerMainFrameDockAction(clientType, entry.id)
      if (delegated != null)
        return false
    }

    // If has import script, run it
    if (
      (entry.type === 'action')
      || (entry.type === 'custom-render')
      || (entry.type === 'iframe' && entry.clientScript)
    ) {
      const current = dockEntryStateMap.get(id)!
      const messagesClient = createClientMessagesClient(rpc)
      const scriptContext: DockClientScriptContext = reactive({
        ...toRefs(docksContext) as any,
        current,
        messages: messagesClient,
        logs: messagesClient,
      })
      await executeSetupScript(entry, scriptContext)
    }

    // Remember the shared frame's current member tab (a member carries its
    // anchor's `frameId` but is not itself a `subTabs` anchor) so re-selecting
    // the usually-hidden anchor later lands back on this visible tab.
    if (entry.type === 'iframe' && entry.frameId && !entry.subTabs)
      frameNavCurrentMember.set(entry.frameId, entry.id)

    // Remember a grouped member as its group's last-opened child so the next
    // activation of the group reopens it directly, ahead of `defaultChildId`
    // (see `resolveGroupPreferredChild`). Guarded assignment: a session store
    // persisted before this field existed has no map yet.
    if (entry.groupId)
      (sessionStore.value.groupLastChildIds ??= {})[entry.groupId] = entry.id

    initialRestorePending.value = false
    selectedDockId.value = entry.id
    sessionStore.value.open = true
    // Only an iframe dock owns an address-bar route; ViewIframe keeps
    // `session.selectedDockRoute` current for it. Clear it for anything else so a stale
    // route from a previous iframe isn't persisted against a non-iframe dock.
    if (entry.type !== 'iframe')
      sessionStore.value.selectedDockRoute = null
    return true
  }

  const toggleEntry = async (id: string) => {
    if (selectedDockId.value === id)
      return switchEntry(null)
    return switchEntry(id)
  }

  // Shared-iframe soft navigation (devframe 0.7.11). An iframe dock flagged
  // `subTabs` is an *anchor* that owns one live iframe (its `frameId`); the
  // embedded app ships a small `postMessage` nav shim. When the anchor's iframe
  // mounts we attach the hub-shipped frame-nav adapter, which runs the ready
  // handshake, turns the reported tab manifest into client-only member docks,
  // and drives the bidirectional nav loop (selecting a member soft-navigates
  // the shared frame; the app's `navigated` report moves the dock highlight).
  //
  // Our shell runs its own dock machinery instead of hub's `createDevframeClientRuntime`,
  // so we replicate the host's `maybeAttachFrameNav`: one adapter per `frameId`,
  // torn down when the anchor is removed.
  //
  // The adapter is bound to a *mounted iframe element*, not just to the `frameId`.
  // Each dock shell (float, edge, popup) owns its own `IframePanes` manager and
  // creates panes in its own document, so switching shells hands us a different
  // iframe in a different realm — the old adapter is disposed and a fresh one
  // attached. For the same reason the adapter must listen on the iframe's own
  // window: in popup mode the frame lives in a Document-PiP document and posts
  // its handshake to *that* window, not to the main one.
  const frameNavAdapters = new Map<string, { iframe: HTMLIFrameElement, dispose: () => void }>()
  const frameNavAnchors = new Map<string, string>()

  const attachFrameNav = (anchor: DevframeViewIframe, state: DockEntryState) => {
    const frameId = anchor.frameId ?? anchor.id
    const start = (iframe: HTMLIFrameElement) => {
      const existing = frameNavAdapters.get(frameId)
      if (existing) {
        if (existing.iframe === iframe)
          return
        existing.dispose()
        frameNavAdapters.delete(frameId)
      }
      const adapter = attachFrameNavClient({
        frameId,
        anchor,
        iframe,
        window: iframe.ownerDocument?.defaultView ?? globalThis,
        docks: {
          register: registerClientDock,
          switchEntry,
          getStateById: (id: string) => dockEntryStateMap.get(id),
        },
      })
      frameNavAdapters.set(frameId, { iframe, dispose: adapter.dispose })
    }
    if (state.domElements.iframe)
      start(state.domElements.iframe)
    state.events.on('dom:iframe:mounted', start)
  }

  watch(
    entries,
    (list) => {
      const seen = new Set<string>()
      for (const meta of list) {
        if (meta.type !== 'iframe' || !meta.subTabs)
          continue
        seen.add(meta.id)
        if (frameNavAnchors.has(meta.id))
          continue
        const state = dockEntryStateMap.get(meta.id)
        if (!state)
          continue
        frameNavAnchors.set(meta.id, meta.frameId ?? meta.id)
        attachFrameNav(meta, state)
      }
      // An anchor that disappeared tears down its adapter, which disposes every
      // member dock it registered and detaches the `postMessage` listener.
      for (const [anchorId, frameId] of [...frameNavAnchors]) {
        if (seen.has(anchorId))
          continue
        frameNavAnchors.delete(anchorId)
        frameNavAdapters.get(frameId)?.dispose()
        frameNavAdapters.delete(frameId)
      }
    },
    { immediate: true },
  )

  // Honor cross-iframe dock-activation requests (devframe 0.7.3). A mounted
  // plugin — or our own launcher's "View in Terminal" action — calls the
  // `hub:docks:activate` RPC; the hub broadcasts `devframe:docks:activate` to
  // every client. Our shell runs its own dock machinery rather than hub's
  // client host, so we handle the broadcast here and switch the active dock
  // ourselves. The target dock (e.g. Terminals) reads `activation.params` to
  // focus a specific session.
  rpc.client.register({
    name: HUB_EVENTS.broadcast.docksActivate satisfies keyof DevframeRpcClientFunctions,
    type: 'action',
    handler: (activation: { dockId: string, params?: Record<string, unknown> }) => {
      if (activation?.dockId)
        switchEntry(activation.dockId)
    },
  })

  // Settings store, `settings`, and `getWhenContext` are established earlier
  // (right before `switchEntry`) — its group→member resolution needs them.
  // `categoryOrderOverride` folds in the reference UI's configured
  // `dockPreferences.categoryOrder` (`createUi({ dockPreferences })`),
  // delivered once via the connection handshake.
  const categoryOrderOverride = rpc.connectionMeta.configs?.ui?.dockPreferences?.categoryOrder
  const groupedEntries = computed(() => {
    return docksGroupByCategories(entries.value, settings.value, { whenContext: getWhenContext(), collapseGroups: true, categoryOrderOverride })
  })

  // Initialize commands context with reactive when-context
  const commandsContextResult = await createCommandsContext(clientType, rpc, settingsStore, getWhenContext)
  commandsContext = commandsContextResult

  // Register built-in client commands
  commandsContext.register([
    {
      id: 'devframes:toggle-palette',
      source: 'client',
      title: 'Toggle Command Palette',
      icon: 'ph:magnifying-glass-duotone',
      showInPalette: false,
      keybindings: [{ key: 'Mod+K' }],
      action: () => {
        commandsContext.paletteOpen = !commandsContext.paletteOpen
      },
    },
    {
      id: 'devframes:close-panel',
      source: 'client',
      title: 'Close Panel',
      icon: 'ph:x-circle-duotone',
      when: 'dockOpen && !paletteOpen',
      keybindings: [{ key: 'Escape' }],
      action: () => {
        sessionStore.value.open = false
        selectedDockId.value = null
      },
    },
    {
      id: 'devframes:open-settings',
      source: 'client',
      title: 'Open Settings',
      icon: 'ph:gear-duotone',
      action: () => {
        switchEntry('~settings')
      },
    },
    {
      id: 'devframes:hide',
      source: 'client',
      title: `Hide ${useBranding().value.productName}`,
      icon: 'ph:eye-slash-duotone',
      // Only the embedded overlay can be dismissed; the standalone page is an
      // explicit visit and stays mounted.
      when: 'clientType == embedded',
      action: () => {
        // Conceal the embedded dock — the Shift+Alt+D reveal shortcut (or a
        // reload) brings it back. In passive mode this is remembered.
        window.dispatchEvent(new CustomEvent(HUB_UI_HIDE_EVENT))
      },
    },
    {
      id: 'devframes:dock-mode',
      source: 'client',
      title: 'Dock Mode',
      icon: 'ph:layout-duotone',
      // While the popup is open the embedded shell is unmounted and the popup
      // renders the standalone layout, so neither mode is observable — mirrors
      // the Appearance settings hiding its own dock-mode control.
      when: clientType === 'embedded' ? 'clientType == embedded && !popupOpen' : undefined,
      children: [
        {
          id: 'devframes:dock-mode:float',
          source: 'client',
          title: 'Float Mode',
          icon: 'ph:cards-three-duotone',
          // Repeated per child: shortcut dispatch reads the matched command's
          // own `when` and does not inherit the parent's.
          when: '!popupOpen',
          action: () => {
            panelStore.value.mode = 'float'
          },
        },
        {
          id: 'devframes:dock-mode:edge',
          source: 'client',
          title: 'Edge Mode',
          icon: 'ph:square-half-bottom-duotone',
          when: '!popupOpen',
          action: () => {
            panelStore.value.mode = 'edge'
          },
        },
      ],
    },
  ])

  // Dynamic dock navigation commands — grouped under "Docks" parent
  let cleanupDocksCommand: (() => void) | undefined
  watchEffect(() => {
    cleanupDocksCommand?.()

    const toCommand = (entry: DevframeDockEntry): DevframeClientCommand => ({
      id: `devframes:docks:${entry.id}`,
      source: 'client' as const,
      title: entry.title,
      icon: resolveCommandIcon(entry.icon),
      action: () => {
        toggleEntry(entry.id)
      },
    })

    // Mirror the dock-bar collapse in the palette: members nest under their
    // group's command, and grouped members drop out of the top level.
    const registeredGroupIds = getRegisteredGroupIds(entries.value)
    const dockChildren: DevframeClientCommand[] = entries.value
      .filter(entry => entry.type !== '~builtin')
      .filter(entry => !(entry.groupId && registeredGroupIds.has(entry.groupId)))
      .map((entry) => {
        if (entry.type !== 'group')
          return toCommand(entry)
        // Members nest under the group, split by their in-group sub-category.
        // A single sub-category (the common case) is flattened directly so the
        // palette doesn't add a pointless one-item drill-down level.
        const memberGroups = getGroupMembersGrouped(entries.value, entry.id, settings.value, { whenContext: getWhenContext() })
        const children: DevframeClientCommand[] = memberGroups.length <= 1
          ? (memberGroups[0]?.[1] ?? []).map(toCommand)
          : memberGroups.map(([category, members]) => ({
              id: `devframes:docks:${entry.id}:cat:${category}`,
              source: 'client' as const,
              title: getCategoryLabel(category),
              children: members.map(toCommand),
            }))
        return {
          ...toCommand(entry),
          children,
        }
      })

    if (dockChildren.length > 0) {
      cleanupDocksCommand = commandsContext.register({
        id: 'devframes:docks',
        source: 'client',
        title: 'Docks',
        icon: 'ph:layout-duotone',
        children: dockChildren,
      })
    }
  })

  // One-shot boot route (see `DocksPanelContext.consumeBootRoute`): the persisted
  // address-bar URL is handed back to exactly the iframe dock that was selected
  // before the reload, once.
  let bootRoute: string | null = restoreIntent.selectedDockId != null ? restoreIntent.selectedDockRoute : null
  const consumeBootRoute = (id: string): string | null => {
    if (bootRoute != null && id === restoreIntent.selectedDockId) {
      const route = bootRoute
      bootRoute = null
      return route
    }
    return null
  }

  docksContext = reactive({
    panel: {
      get state() {
        return createDockPanelState(
          panelVisible.value !== false,
          sessionStore.value.open,
          selectedDockId.value,
        )
      },
      events: markRaw(panelEvents),
      store: panelStore,
      session: sessionStore,
      isDragging: false,
      isResizing: false,
      isVertical: computed(() => panelStore.value.position === 'left' || panelStore.value.position === 'right'),
      consumeBootRoute,
    },
    docks: {
      selectedId: selectedDockId,
      selectedRoute: selectedDockRoute,
      selected,
      entries,
      entryToStateMap: markRaw(dockEntryStateMap),
      groupedEntries,
      categoryOrder: categoryOrderOverride ? { ...DEFAULT_CATEGORIES_ORDER, ...categoryOrderOverride } : DEFAULT_CATEGORIES_ORDER,
      settings: settingsStore,
      getStateById: (id: string) => dockEntryStateMap.get(id),
      switchEntry,
      toggleEntry,
      register: registerClientDock,
      update: updateClientDock,
    },
    commands: commandsContext,
    when: {
      get context() {
        return getWhenContext()
      },
    },
    connection: {
      get status() {
        return rpc.status
      },
      get error() {
        return rpc.connectionError
      },
      events: rpc.events,
    },
    renderers: markRaw(createDockRenderersContext({
      context: () => docksContext as DevframeClientContext,
      manifest: () => rendererManifest.value,
    })),
    rpc: markRaw(rpc),
    clientType,
  })

  registerMainFrameDockActionHandler(clientType, async (id) => {
    const entry = entries.value.find(e => e.id === id)
    if (!entry || entry.type !== 'action')
      return false
    return switchEntry(entry.id)
  })

  const waitUntilTrusted = async (): Promise<void> => {
    if (rpc.isTrusted)
      return
    await new Promise<void>((resolve) => {
      const stopListening = rpc.events.on(DEVFRAME_EVENTS.client.isTrustedUpdated, (isTrusted) => {
        if (!isTrusted)
          return
        stopListening()
        resolve()
      })
    })
  }

  // A reload starts untrusted, and Dock.vue temporarily closes the panel during
  // that window. The trust event precedes the asynchronous `devframe:docks`
  // and renderer-manifest responses, so wait for all three before re-applying
  // the captured session intent.
  // `switchEntry` then consumes the persisted iframe route when the view boots.
  const restoreAfterInitialization = async (): Promise<void> => {
    // The authorization gate can still clear the live session on reload, so restore only after it settles.
    await waitUntilTrusted()

    const restoreDockId = restoreIntent.selectedDockId
    if (!restoreIntent.open || restoreDockId == null)
      return

    await Promise.all([
      dockEntriesInitialSyncComplete,
      rendererManifestInitialSyncComplete,
    ])

    if (!initialRestorePending.value)
      return

    if (selectedDockId.value !== restoreDockId) {
      initialRestorePending.value = false
      return
    }

    initialRestorePending.value = false
    await switchEntry(restoreDockId)
  }
  const startPanelStateEvents = (): void => {
    let previousPanelState = docksContext.panel.state
    watch(
      [panelVisible, () => sessionStore.value.open, selectedDockId],
      () => {
        const panelState = docksContext.panel.state
        if (
          panelState.state === previousPanelState.state
          && panelState.selectedDockId === previousPanelState.selectedDockId
        ) {
          return
        }

        previousPanelState = panelState
        panelEvents.emit(HUB_EVENTS.client.docksPanelStateChanged, panelState)
      },
      { flush: 'post' },
    )
  }
  void restoreAfterInitialization().then(startPanelStateEvents, startPanelStateEvents)

  docksContextByRpc.set(rpc, docksContext)
  return docksContext
}
