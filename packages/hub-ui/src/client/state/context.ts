import type { DevframeClientCommand, DevframeDockEntry, DevframeDockPanelState, DevframeDockUserEntry, DevframeRpcClientFunctions, DevframeViewIframe } from '@devframes/hub'
import type { CommandsContext, DevframeClientContext, DevframeRpcClient, DockClientScriptContext, DockEntryState, DockPanelStorage, DockRegistration, DockRendererManifest, DocksContext, DockSessionStorage, DocksPanelEvents } from '@devframes/hub/client'
import type { SharedState } from 'devframe/utils/shared-state'
import type { WhenContext } from 'devframe/utils/when'
import type { Ref } from 'vue'
import type { DevframeDocksUserSettings } from './dock-settings'
import type { InspectedPageTarget } from './inspected-page'
import { attachFrameNavClient, createDockRenderersContext } from '@devframes/hub/client'
import { DEFAULT_STATE_USER_SETTINGS, DOCK_RENDERERS_STATE_KEY, HUB_EVENTS } from '@devframes/hub/constants'
import { DEVFRAME_EVENTS } from 'devframe/constants'
import { createEventEmitter } from 'devframe/utils/events'
import { computed, markRaw, reactive, ref, toRefs, watch, watchEffect } from 'vue'
import { BUILTIN_ENTRIES, BUILTIN_ENTRY_SETTINGS, DEFAULT_CATEGORIES_ORDER, HUB_UI_HIDE_EVENT } from '../constants'
import { useBranding } from './branding'
import { createCommandsContext } from './commands'
import { docksGroupByCategories, getGroupMembers, getRegisteredGroupIds, resolveCommandIcon, resolveGroupPreferredChild } from './dock-settings'
import { createDockEntryState, DEFAULT_DOCK_PANEL_STORE, DEFAULT_DOCK_SESSION_STORE, sharedStateToRef, useDocksEntries, waitForInitialSharedStateSync } from './docks'
import { installInspectedPageHost } from './inspected-page'
import { createClientMessagesClient } from './messages-client'
import { dockCommandId } from './palette'
import { registerMainFrameDockActionHandler, triggerMainFrameDockAction, useIsDockPopupOpen } from './popup'
import { executeSetupScript } from './setup-script'

const docksContextByRpc = new WeakMap<DevframeRpcClient, DocksContext>()
export async function createDocksContext(
  clientType: 'embedded' | 'standalone',
  rpc: DevframeRpcClient,
  panelStore?: Ref<DockPanelStorage>,
  sessionStore?: Ref<DockSessionStorage>,
  panelVisible: Ref<boolean> = ref(true),
  inspectedPage?: InspectedPageTarget,
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
    // hub-ui owns the built-in Settings tab so it's always reachable without a
    // host registering `~settings`; a host that registered its own wins, so add
    // ours only when the merged list has none.
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
  // lands back on the same dock; see the restore effect near the end.
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
      throw new Error(`[@devframes/hub-ui] a client dock "${entry.id}" is already registered; pass force to overwrite`)
    clientDocks.set(entry.id, entry)
    // Eagerly materialize the entry's DockEntryState. The reactive watchEffect
    // above only creates states on its next flush, but a caller such as the
    // shared-iframe frame-nav adapter subscribes to `entry:activated` (via
    // `getStateById`) synchronously right after registering, so the state has
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
      throw new Error(`[@devframes/hub-ui] no client dock "${entry.id}" to update; register it first`)
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

  // Get settings store ahead of `switchEntry`, whose group→member resolution
  // needs `getWhenContext` to honor a `defaultChildId` target's `when` clause.
  const settingsStore = markRaw(await getSettingsStore())
  // Raw, not `useSettings`: the context this would key off doesn't exist yet,
  // and the only consumers are the `dock-settings.ts` helpers below, which
  // resolve hub-ui's own defaults themselves.
  const settings = sharedStateToRef(settingsStore)

  // Shared when-context provider, used by both commands and docks
  let commandsContext: CommandsContext
  const isDockPopupOpen = useIsDockPopupOpen()
  const getWhenContext = (): WhenContext => ({
    clientType,
    dockOpen: sessionStore.value.open,
    paletteOpen: commandsContext?.paletteOpen ?? false,
    dockSelectedId: selectedDockId.value ?? '',
    popupOpen: isDockPopupOpen.value,
  })

  // The shared frame's live member tab, keyed by `frameId`. Lets `switchEntry`
  // redirect a re-selection of the (usually hidden) `subTabs` anchor onto the
  // visible member tab instead of the invisible anchor.
  const frameNavCurrentMember = new Map<string, string>()

  // An entry with no view of its own redirects to the id to select instead: a
  // group to its preferred member, a `subTabs` anchor to its live member.
  // `false` = popover-only group (caller fails); `null` = select as-is.
  const resolveRedirectTarget = (entry: DevframeDockEntry): string | false | null => {
    if (entry.type === 'group') {
      return resolveGroupPreferredChild(entries.value, entry, sessionStore.value.groupLastChildIds?.[entry.id], getWhenContext())?.id
        ?? getGroupMembers(entries.value, entry.id)[0]?.id
        ?? false
    }
    if (entry.type === 'iframe' && entry.subTabs) {
      const frameId = entry.frameId ?? entry.id
      const currentMemberId = frameNavCurrentMember.get(frameId)
      if (currentMemberId && currentMemberId !== entry.id && entries.value.some(e => e.id === currentMemberId))
        return currentMemberId
    }
    return null
  }

  const runDockSetupScript = async (entry: DevframeDockEntry) => {
    const hasScript = entry.type === 'action' || entry.type === 'custom-render' || (entry.type === 'iframe' && entry.clientScript)
    if (!hasScript)
      return
    if (inspectedPage && entry.type !== 'custom-render') {
      if (entry.type === 'iframe' && !await inspectedPage.prepare(entry.id))
        throw new Error(`The inspected page could not prepare dock "${entry.id}".`)
      return
    }
    const messagesClient = createClientMessagesClient(rpc)
    const scriptContext: DockClientScriptContext = reactive({
      ...toRefs(docksContext) as any,
      current: dockEntryStateMap.get(entry.id)!,
      messages: messagesClient,
    })
    await executeSetupScript(entry, scriptContext)
  }

  // Remember selection redirects: a member tab as its frame's live tab, and a
  // grouped non-action member as its group's last-opened child. One-shot actions
  // leave the preferred panel unchanged. Only iframes own an address-bar route,
  // so clear a stale route for anything else.
  const rememberEntrySelection = (entry: DevframeDockEntry) => {
    if (entry.type === 'iframe' && entry.frameId && !entry.subTabs)
      frameNavCurrentMember.set(entry.frameId, entry.id)
    if (entry.type !== 'action' && entry.groupId)
      (sessionStore.value.groupLastChildIds ??= {})[entry.groupId] = entry.id
    if (entry.type !== 'iframe')
      sessionStore.value.selectedDockRoute = null
  }

  let selectionGeneration = 0
  let inspectedActionQueue = Promise.resolve()
  const prepareAction = async (entry: DevframeDockEntry, generation: number): Promise<boolean> => {
    if (inspectedPage) {
      // Complete stale activation cleanup before starting a newer action,
      // including another activation of the same dock entry.
      const activation = inspectedActionQueue.then(async () => {
        if (generation !== selectionGeneration || !await inspectedPage.activate(entry.id))
          return false
        if (generation !== selectionGeneration) {
          await inspectedPage.deactivate(entry.id)
          return false
        }
        return true
      })
      inspectedActionQueue = activation.then(() => {}, () => {})
      return activation
    }
    else {
      const delegated = await triggerMainFrameDockAction(clientType, entry.id)
      if (delegated != null)
        return false
      // Import/setup must finish before activation is emitted. Page scripts
      // such as Vue Tracer install their activation listener during setup.
      await runDockSetupScript(entry)
    }
    return generation === selectionGeneration
  }

  const switchEntry = async (id: string | null = null): Promise<boolean> => {
    const generation = ++selectionGeneration
    const previous = selected.value
    if (inspectedPage && previous?.type === 'action' && previous.id !== id)
      await inspectedPage.deactivate(previous.id)
    if (generation !== selectionGeneration)
      return false
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

    const redirect = resolveRedirectTarget(entry)
    if (redirect === false)
      return false
    if (redirect !== null)
      return switchEntry(redirect)

    if (entry.type === 'action' && !await prepareAction(entry, generation))
      return false

    initialRestorePending.value = false
    selectedDockId.value = entry.id
    sessionStore.value.open = true

    if (entry.type !== 'action')
      await runDockSetupScript(entry)
    rememberEntrySelection(entry)
    return true
  }

  const toggleEntry = async (id: string) => {
    if (selectedDockId.value === id)
      return switchEntry(null)
    return switchEntry(id)
  }

  // Shared-iframe soft navigation: a `subTabs` anchor's frame-nav adapter turns
  // reported tabs into member docks and drives the nav loop. We bind one adapter
  // per mounted iframe element (not just `frameId`) since each shell owns its own
  // realm: in popup mode the adapter must listen on the PiP window.
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

  // Honor cross-iframe dock-activation broadcasts. Since our shell runs its own
  // dock machinery rather than hub's client host, we handle the broadcast here
  // and switch the active dock; the target reads `activation.params` to focus.
  rpc.client.register({
    name: HUB_EVENTS.broadcast.docksActivate satisfies keyof DevframeRpcClientFunctions,
    type: 'action',
    handler: (activation: { dockId: string, params?: Record<string, unknown> }) => {
      if (activation?.dockId)
        switchEntry(activation.dockId)
    },
  })

  // Settings store, `settings`, and `getWhenContext` are established earlier
  // (right before `switchEntry`), whose group→member resolution needs them.
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
      action: async () => {
        await switchEntry(null)
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
      /**
       * Only the embedded overlay can be dismissed; the standalone page is an
       * explicit visit and stays mounted.
       */
      when: 'clientType == embedded',
      action: () => {
        // Conceal the embedded dock; the Shift+Alt+D reveal shortcut (or a
        // reload) brings it back. In passive mode this is remembered.
        window.dispatchEvent(new CustomEvent(HUB_UI_HIDE_EVENT))
      },
    },
    {
      id: 'devframes:dock-mode',
      source: 'client',
      title: 'Dock Mode',
      icon: 'ph:layout-duotone',
      /**
       * While the popup is open the embedded shell is unmounted and the popup
       * renders the standalone layout, so neither mode is observable, mirroring
       * the Appearance settings hiding its own dock-mode control.
       */
      when: clientType === 'embedded' ? 'clientType == embedded && !popupOpen' : undefined,
      children: [
        {
          id: 'devframes:dock-mode:float',
          source: 'client',
          title: 'Float Mode',
          icon: 'ph:cards-three-duotone',
          /**
           * Repeated per child: shortcut dispatch reads the matched command's
           * own `when` and does not inherit the parent's.
           */
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

  // Dynamic dock navigation commands, grouped under the "Docks" parent
  let cleanupDocksCommand: (() => void) | undefined
  watchEffect(() => {
    cleanupDocksCommand?.()

    const toCommand = (entry: DevframeDockEntry): DevframeClientCommand => ({
      id: dockCommandId(entry.id),
      source: 'client' as const,
      title: entry.title,
      icon: resolveCommandIcon(entry.icon),
      action: () => {
        toggleEntry(entry.id)
      },
    })

    // Activating a group command must not guess a member. An unambiguous target
    // (last opened, `defaultChildId`, or a lone visible member) opens directly,
    // like an ungrouped dock. Otherwise the palette opens scoped to the group's
    // members. The dock rail follows the same preference, opening its member
    // popover when neither resolves.
    const activateGroup = (
      commandId: string,
      directId: string | undefined,
    ) => {
      if (directId) {
        toggleEntry(directId)
        return
      }
      // Pressing the same shortcut again closes the palette it just opened.
      if (commandsContext.paletteOpen && commandsContext.paletteScopeId === commandId) {
        commandsContext.paletteOpen = false
        return
      }
      commandsContext.openPalette(commandId)
    }

    // Mirror the dock-bar collapse in the palette: members nest under their
    // group's command, and grouped members drop out of the top level.
    const registeredGroupIds = getRegisteredGroupIds(entries.value)
    const dockChildren: DevframeClientCommand[] = entries.value
      .filter(entry => entry.type !== '~builtin')
      .filter(entry => !(entry.groupId && registeredGroupIds.has(entry.groupId)))
      .flatMap((entry): DevframeClientCommand[] => {
        if (entry.type !== 'group')
          return [toCommand(entry)]
        // Members hang directly off their group, in the dock rail's sub-category
        // order. The rail's sub-category *dividers* have no counterpart here: a
        // category is not something you can run, and turning one into a command
        // would add an inert row nothing can bind to. Ordering carries the
        // grouping instead.
        const visibleMembers = getGroupMembers(entries.value, entry.id, settings.value, { whenContext: getWhenContext() })
        const preferredChildId = resolveGroupPreferredChild(
          entries.value,
          entry,
          sessionStore.value.groupLastChildIds?.[entry.id],
          getWhenContext(),
        )?.id
        // Same empty-group rule the dock rail applies (`DockEntries.isDockVisible`):
        // with no visible member and no reachable preferred child there is
        // nothing to activate, so the group gets no command at all rather than a
        // dead row in the palette and the shortcut settings.
        if (visibleMembers.length === 0 && !preferredChildId)
          return []
        const commandId = dockCommandId(entry.id)
        return [{
          ...toCommand(entry),
          action: () => activateGroup(
            commandId,
            preferredChildId ?? (visibleMembers.length === 1 ? visibleMembers[0]!.id : undefined),
          ),
          children: visibleMembers.map(toCommand),
        }]
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
        let state: DevframeDockPanelState['state']
        if (!panelVisible.value)
          state = 'hidden'
        else if (sessionStore.value.open)
          state = 'open'
        else
          state = 'closed'

        const panelState: DevframeDockPanelState = { state }
        if (selectedDockId.value !== null)
          panelState.selectedDockId = selectedDockId.value
        return panelState
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

  inspectedPage?.onSelection((id) => {
    if (selected.value?.type === 'action' && id !== selectedDockId.value) {
      selectedDockId.value = null
      sessionStore.value.open = false
    }
  })

  if (clientType === 'embedded' && typeof window !== 'undefined') {
    installInspectedPageHost({
      async prepare(id) {
        if (!rpc.isTrusted)
          return false
        const entry = entries.value.find(entry => entry.id === id)
        if (!entry || entry.type !== 'iframe' || !entry.clientScript)
          return false
        await runDockSetupScript(entry)
        return true
      },
      async activate(id) {
        if (!rpc.isTrusted || entries.value.find(entry => entry.id === id)?.type !== 'action')
          return false
        return switchEntry(id)
      },
      async deactivate(id) {
        if (selected.value?.type !== 'action' || selectedDockId.value !== id)
          return false
        return switchEntry(null)
      },
      onSelection(listener) {
        return panelEvents.on(HUB_EVENTS.client.docksPanelStateChanged, () => {
          listener(selected.value?.type === 'action' ? selected.value.id : null)
        })
      },
    })
  }

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
    const restoreDockId = restoreIntent.selectedDockId
    if (!restoreIntent.open || restoreDockId == null)
      return

    await Promise.all([
      waitUntilTrusted(),
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
  void restoreAfterInitialization()

  docksContextByRpc.set(rpc, docksContext)
  return docksContext
}
