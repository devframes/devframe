import type { DevframeRpcClient, DevframeRpcClientOptions } from 'devframe/client'
import type { WhenContext } from 'devframe/utils/when'
import type {
  DevframeClientCommand,
  DevframeCommandEntry,
  DevframeCommandKeybinding,
  DevframeServerCommandEntry,
} from '../types/commands'
import type {
  ClientScriptEntry,
  DevframeDockEntriesGrouped,
  DevframeDockEntry,
  DevframeViewIframe,
} from '../types/docks'
import type { DevframeDocksUserSettings } from '../types/settings'
import type { DockClientScriptContext } from './client-script'
import type {
  CommandsContext,
  DevframeClientContext,
  DockClientType,
  DockEntryState,
  DocksEntriesContext,
  DocksPanelContext,
  WhenClauseContext,
} from './docks'
import type { DockRenderer, DockRendererManifest, DockRenderersContext } from './renderers'
import { connectDevframe } from 'devframe/client'
import { createEventEmitter } from 'devframe/utils/events'
import { clientScriptFailureHint, resolveClientModuleSpecifier } from '../client-modules'
import { DEFAULT_CATEGORIES_ORDER, DEFAULT_STATE_USER_SETTINGS, DOCK_RENDERERS_STATE_KEY } from '../constants'
import { HUB_EVENTS } from '../events'
import { getDevframeClientContext, setDevframeClientContext } from './context'
import { attachFrameNavClient } from './frame-nav'
import { createMessagesClient } from './messages'
import { reportDockPanelState } from './panel-state'
import { createDockRenderersContext } from './renderers'

const DOCKS_STATE_KEY = HUB_EVENTS.sharedState.docks
const COMMANDS_STATE_KEY = HUB_EVENTS.sharedState.commands
const USER_SETTINGS_STATE_KEY = HUB_EVENTS.sharedState.userSettings
const DOCKS_ACTIVATE_EVENT = HUB_EVENTS.broadcast.docksActivate

export interface DevframeClientHostOptions {
  /**
   * An already-connected RPC client. When omitted, one is created via
   * `connectDevframe(connect)` — pass `connect.baseURL` to point at the hub's
   * connection-meta mount (e.g. `/__hub/`).
   */
  rpc?: DevframeRpcClient
  /** Options forwarded to `connectDevframe` when `rpc` is not supplied. */
  connect?: DevframeRpcClientOptions
  /**
   * Environment the host runs in.
   * - `'standalone'` (default) — the runtime owns the whole page (a hub UI).
   * - `'embedded'` — the runtime lives inside a user app alongside a panel.
   */
  clientType?: DockClientType
  /**
   * Import and run the client scripts declared on dock entries (`action`,
   * `custom-render`, and iframe `clientScript`). Default `true`.
   */
  loadClientScripts?: boolean
  /**
   * Resolve a **bare-specifier** client script (`importFrom` naming an npm
   * module) to a URL this page can import — a viewer's own policy, winning
   * over the host-advertised `ConnectionMeta.configs.dock.clientModuleResolution`
   * template (return `undefined` to fall through to it). URL specifiers never
   * reach this hook. E.g. on a Vite-served page:
   * `resolveClientModule: s => `/@id/${s}``.
   */
  resolveClientModule?: (specifier: string) => string | undefined
  /**
   * Dock renderers to register at boot, keyed by dock `type`. The host
   * application injects the ones it wants (e.g.
   * `{ 'json-render': createJsonRenderDockRenderer() }` from
   * `@devframes/json-render-ui`). The hub ships none by default.
   *
   * Local registrations take precedence over the hub's renderer manifest
   * (`initHub({ renderers })`) — explicit local code beats wire config.
   */
  renderers?: Record<string, DockRenderer<any>>
  /**
   * Hub-wide override of the top-level dock-bar category ordering — a map of
   * category id → ordering weight (lower sorts earlier), mirroring the shape
   * of {@link import('../constants').DEFAULT_CATEGORIES_ORDER}.
   *
   * This is the OUTER bucket ordering: it governs every ungrouped entry's own
   * `category` and every group's `category` (see
   * {@link import('../types/docks').DevframeDockEntryBase.category}). It is
   * distinct from {@link import('../types/docks').DevframeViewGroup.categoryOrder},
   * which only reorders the IN-GROUP sub-categories of one specific group.
   *
   * Keys are merged over `DEFAULT_CATEGORIES_ORDER`, so the host app only
   * lists the categories it wants to move; any category absent from the map
   * keeps its default weight.
   *
   * @example
   * ```ts
   * // Surface `data` tools ahead of `app` tools, hub-wide.
   * createDevframeClientHost({ categoryOrder: { data: 50 } })
   * ```
   */
  categoryOrder?: Record<string, number>
}

export interface DevframeClientHost {
  /** The assembled, globally-registered client host context. */
  context: DevframeClientContext
  /** Tear down listeners and stop tracking newly-registered client scripts. */
  dispose: () => void
}

/**
 * Boot the framework-level client host: connect RPC, assemble the full
 * {@link DevframeClientContext} (panel, docks, commands, when) from the hub's
 * shared state, publish it at `__DEVFRAME_HUB_CLIENT_CONTEXT__`, and load every
 * dock entry's client script into this page — the devframe equivalent of the
 * runtime `@vitejs/devtools-kit` injects into a host app.
 *
 * A viewer keeps rendering its own dock UI (reading the same shared state); this
 * runtime is what gives plugin client scripts a live host context to run in.
 */
export async function createDevframeClientHost(
  options: DevframeClientHostOptions = {},
): Promise<DevframeClientHost> {
  const clientType: DockClientType = options.clientType ?? 'standalone'
  const rpc = options.rpc ?? await connectDevframe(options.connect)
  // Set by createRenderersContext(); teardown disposes every live mount.
  let mountedRenderers: Set<() => void> | undefined

  const [docksState, commandsState, settings, renderersManifestState] = await Promise.all([
    rpc.sharedState.get<DevframeDockEntry[]>(DOCKS_STATE_KEY, { initialValue: [] }),
    rpc.sharedState.get<DevframeServerCommandEntry[]>(COMMANDS_STATE_KEY, { initialValue: [] }),
    rpc.sharedState.get<DevframeDocksUserSettings>(USER_SETTINGS_STATE_KEY, {
      initialValue: DEFAULT_STATE_USER_SETTINGS(),
    }),
    rpc.sharedState.get<DockRendererManifest>(DOCK_RENDERERS_STATE_KEY, { initialValue: {} }),
  ])

  let selectedId: string | null = null
  const entryToStateMap = new Map<string, DockEntryState>()
  // Docks registered live in this page via `docks.register()`. They never flow
  // into the `devframe:docks` shared state (client-only), and are merged with
  // the server entries — a client dock overriding a server one of the same id.
  const clientDocks = new Map<string, DevframeDockEntry>()
  // Live frame-nav adapters for shared-frame anchors, keyed by frameId, so we
  // attach one adapter per shared iframe and tear them all down on dispose.
  const frameNavAdapters = new Map<string, () => void>()
  const loadScriptsEnabled = options.loadClientScripts ?? true

  // Resolved once at boot, fixed for the session: the default table overridden
  // by this host page's own explicit option.
  const categoryOrder: Record<string, number> = {
    ...DEFAULT_CATEGORIES_ORDER,
    ...options.categoryOrder,
  }

  const sendPanelState = (open: boolean): void => {
    void reportDockPanelState(rpc, open).catch(() => {})
  }
  const panel = createPanelContext(clientType, sendPanelState)
  const docks = createDocksContext()
  const commands = createCommandsContext()
  const renderers = createRenderersContext()
  const when: WhenClauseContext = {
    get context(): WhenContext {
      return {
        clientType,
        dockOpen: panel.session.open,
        paletteOpen: commands.paletteOpen,
        dockSelectedId: selectedId ?? '',
      }
    },
  }

  const context: DevframeClientContext = {
    rpc,
    clientType,
    panel,
    docks,
    commands,
    renderers,
    when,
    connection: {
      get status() {
        return rpc.status
      },
      get error() {
        return rpc.connectionError
      },
      events: rpc.events,
    },
  }

  const disposers: Array<() => void> = []
  reconcileEntries()
  disposers.push(docksState.on('updated', reconcileEntries))

  // Honor cross-iframe dock activation: any client (e.g. a mounted devframe in
  // its own iframe) can ask the hub to switch this shell's active dock via the
  // `hub:docks:activate` RPC, which the hub broadcasts here. `switchEntry`
  // ignores ids it doesn't recognize, so an unknown target degrades to a no-op.
  // Another consumer sharing this rpc client may have registered the handler
  // already — chain onto it rather than replacing it.
  const activateHandler = (activation: { dockId?: string } | undefined): void => {
    if (activation?.dockId)
      void switchEntry(activation.dockId)
  }
  const existingActivate = rpc.client.definitions.get(DOCKS_ACTIVATE_EVENT)
  if (existingActivate) {
    const prev = existingActivate.handler
    existingActivate.handler = (...args: unknown[]) => {
      activateHandler(args[0] as { dockId?: string })
      return prev?.(...args)
    }
  }
  else {
    rpc.client.register({
      name: DOCKS_ACTIVATE_EVENT,
      type: 'action',
      handler: (activation: { dockId?: string }) => activateHandler(activation),
    })
  }

  if (getDevframeClientContext()) {
    console.warn(
      '[@devframes/hub] A client host context is already published on this page — replacing it. '
      + 'Boot createDevframeClientHost() once per page (e.g. HTML injection combined with a manual import boots it twice).',
    )
  }
  setDevframeClientContext(context)
  sendPanelState(panel.session.open)

  const loadedScripts = new Set<string>()
  if (loadScriptsEnabled) {
    loadClientScripts()
    disposers.push(docksState.on('updated', loadClientScripts))
  }

  return {
    context,
    dispose() {
      for (const off of disposers.splice(0)) off()
      for (const disposeAdapter of frameNavAdapters.values()) disposeAdapter()
      frameNavAdapters.clear()
      if (mountedRenderers) {
        for (const disposeMount of [...mountedRenderers]) disposeMount()
      }
      if (getDevframeClientContext() === context)
        setDevframeClientContext(undefined)
    },
  }

  // ── docks ──────────────────────────────────────────────────────────────

  function createDockEntryState(entryMeta: DevframeDockEntry): DockEntryState {
    return {
      entryMeta,
      get isActive() {
        return selectedId === entryMeta.id
      },
      domElements: {},
      events: createEventEmitter(),
    }
  }

  // Auto-attach the frame-nav adapter to a shared-frame anchor iframe once its
  // iframe element mounts, so a `subTabs` plugin's tabs surface as client-only
  // member docks with soft navigation. One adapter per `frameId`.
  function maybeAttachFrameNav(meta: DevframeDockEntry, state: DockEntryState): void {
    if (meta.type !== 'iframe')
      return
    const anchor = meta as DevframeViewIframe
    if (!anchor.subTabs)
      return
    const frameId = anchor.frameId ?? anchor.id
    const start = (iframe: HTMLIFrameElement): void => {
      if (frameNavAdapters.has(frameId))
        return
      const adapter = attachFrameNavClient({ frameId, anchor, iframe, docks })
      frameNavAdapters.set(frameId, adapter.dispose)
    }
    if (state.domElements.iframe)
      start(state.domElements.iframe)
    state.events.on('dom:iframe:mounted', start)
  }

  // The merged dock list: server entries from shared state overlaid with any
  // client-registered docks (client wins on id collision, new ids appended).
  function currentEntries(): DevframeDockEntry[] {
    const server = docksState.value() as DevframeDockEntry[]
    if (clientDocks.size === 0)
      return server
    const merged: DevframeDockEntry[] = []
    const seen = new Set<string>()
    for (const entry of server) {
      merged.push(clientDocks.get(entry.id) ?? entry)
      seen.add(entry.id)
    }
    for (const [id, entry] of clientDocks) {
      if (!seen.has(id))
        merged.push(entry)
    }
    return merged
  }

  // Re-run the reconcile + client-script load after a local dock mutation
  // (register/update/dispose), which doesn't emit the shared-state `updated`
  // event that the server path relies on.
  function refreshEntries(): void {
    reconcileEntries()
    if (loadScriptsEnabled)
      loadClientScripts()
  }

  function reconcileEntries(): void {
    const entries = currentEntries()
    const seen = new Set<string>()

    for (const meta of entries) {
      seen.add(meta.id)
      const existing = entryToStateMap.get(meta.id)
      if (!existing) {
        const state = createDockEntryState(meta)
        entryToStateMap.set(meta.id, state)
        maybeAttachFrameNav(meta, state)
      }
      else if (existing.entryMeta !== meta) {
        existing.entryMeta = meta
        existing.events.emit('entry:updated', meta as any)
      }
    }
    for (const id of [...entryToStateMap.keys()]) {
      if (seen.has(id))
        continue
      const removed = entryToStateMap.get(id)
      entryToStateMap.delete(id)
      // Tear down a shared-frame adapter when its anchor iframe goes away.
      const removedMeta = removed?.entryMeta as DevframeViewIframe | undefined
      if (removedMeta?.type === 'iframe' && removedMeta.subTabs) {
        const frameId = removedMeta.frameId ?? id
        frameNavAdapters.get(frameId)?.()
        frameNavAdapters.delete(frameId)
      }
    }

    docks.entries = entries
    docks.groupedEntries = groupByCategory(entries, categoryOrder)
    if (selectedId && !entryToStateMap.has(selectedId)) {
      selectedId = null
      panel.session.selectedDockId = null
      panel.session.selectedDockRoute = null
    }
  }

  function createDocksContext(): DocksEntriesContext {
    const ctx: DocksEntriesContext = {
      get selectedId() {
        return selectedId
      },
      set selectedId(id: string | null) {
        void switchEntry(id)
      },
      // A mirror of the session field, so a persisting host reads and writes the
      // selected iframe's route through the same context every viewer uses.
      get selectedRoute() {
        return panel.session.selectedDockRoute
      },
      set selectedRoute(route: string | null) {
        panel.session.selectedDockRoute = route
      },
      get selected() {
        return (selectedId && entryToStateMap.get(selectedId)?.entryMeta) || null
      },
      entries: [],
      entryToStateMap,
      groupedEntries: [],
      categoryOrder,
      settings,
      getStateById: id => entryToStateMap.get(id),
      switchEntry,
      toggleEntry: id => (selectedId === id ? switchEntry(null) : switchEntry(id)),
      register(entry, force) {
        if (clientDocks.has(entry.id) && !force)
          throw new Error(`[@devframes/hub] a client dock "${entry.id}" is already registered — pass force to overwrite`)
        clientDocks.set(entry.id, entry)
        refreshEntries()
        return {
          update: (patch) => {
            if (patch.id && patch.id !== entry.id)
              throw new Error(`[@devframes/hub] cannot change a dock id ("${entry.id}" → "${patch.id}")`)
            const existing = clientDocks.get(entry.id)
            if (!existing)
              throw new Error(`[@devframes/hub] client dock "${entry.id}" was removed — register it again to update`)
            clientDocks.set(entry.id, { ...existing, ...patch } as DevframeDockEntry)
            refreshEntries()
          },
          dispose: () => {
            if (clientDocks.delete(entry.id))
              refreshEntries()
          },
        }
      },
      update(entry) {
        if (!clientDocks.has(entry.id))
          throw new Error(`[@devframes/hub] no client dock "${entry.id}" to update — register it first`)
        clientDocks.set(entry.id, entry)
        refreshEntries()
      },
    }
    return ctx
  }

  async function switchEntry(id?: string | null): Promise<boolean> {
    const next = id ?? null
    if (next === selectedId)
      return false
    if (next !== null && !entryToStateMap.has(next))
      return false

    const previous = selectedId
    selectedId = next
    // Mirror onto the session context so a persisting host and the when-clause
    // context see the current selection.
    panel.session.selectedDockId = next
    // Only an iframe dock owns an address-bar route, so drop the remembered one
    // for anything else rather than leaving it attached to the new selection.
    if (next === null || entryToStateMap.get(next)?.entryMeta.type !== 'iframe')
      panel.session.selectedDockRoute = null
    if (previous)
      entryToStateMap.get(previous)?.events.emit('entry:deactivated')
    if (next)
      entryToStateMap.get(next)?.events.emit('entry:activated')
    return true
  }

  // ── commands ───────────────────────────────────────────────────────────

  function createCommandsContext(): CommandsContext {
    const clientCommands = new Map<string, DevframeClientCommand>()

    function allCommands(): DevframeCommandEntry[] {
      return [...(commandsState.value() as DevframeServerCommandEntry[]), ...clientCommands.values()]
    }

    const ctx: CommandsContext = {
      get commands() {
        return allCommands()
      },
      get paletteCommands() {
        return allCommands().filter(c => c.showInPalette !== false)
      },
      register(input) {
        const list = Array.isArray(input) ? input : [input]
        for (const cmd of list) clientCommands.set(cmd.id, cmd)
        return () => {
          for (const cmd of list) clientCommands.delete(cmd.id)
        }
      },
      async execute(id, ...args) {
        const client = clientCommands.get(id)
        if (client?.action)
          return client.action(...args)
        // Server command — dispatch through the hub built-in.
        return rpc.call('hub:commands:execute', id, ...args)
      },
      getKeybindings(id): DevframeCommandKeybinding[] {
        const override = settings.value().commandShortcuts?.[id]
        if (override)
          return override as DevframeCommandKeybinding[]
        return allCommands().find(c => c.id === id)?.keybindings ?? []
      },
      settings,
      paletteOpen: false,
    }
    return ctx
  }

  // ── renderers ────────────────────────────────────────────────────────────

  function createRenderersContext(): DockRenderersContext {
    // Every live mount's disposer, so host teardown cleans them all up.
    const mountedDisposers = new Set<() => void>()
    mountedRenderers = mountedDisposers

    return createDockRenderersContext({
      context: () => context,
      ...(options.renderers ? { local: options.renderers } : {}),
      manifest: () => renderersManifestState.value() as DockRendererManifest,
      onMounted(dispose, entry) {
        mountedDisposers.add(dispose)
        // Dispose when the dock deactivates — the Vite viewer leaked here by
        // never unsubscribing the renderer's shared-state listeners.
        const offDeactivate = entryToStateMap.get(entry.id)?.events.on('entry:deactivated', dispose)
        return () => {
          mountedDisposers.delete(dispose)
          offDeactivate?.()
        }
      },
    })
  }

  // ── client scripts ───────────────────────────────────────────────────────

  function clientScriptOf(entry: DevframeDockEntry): ClientScriptEntry | undefined {
    return (entry as any).action ?? (entry as any).renderer ?? (entry as any).clientScript
  }

  function loadClientScripts(): void {
    for (const entry of currentEntries()) {
      const script = clientScriptOf(entry)
      if (!script?.importFrom || loadedScripts.has(entry.id))
        continue
      loadedScripts.add(entry.id)
      void runClientScript(entry.id, script)
    }
  }

  async function runClientScript(entryId: string, script: ClientScriptEntry): Promise<void> {
    // A bare specifier resolves through the explicit option, then the
    // host-advertised template; URL specifiers pass through untouched. (The
    // rpc reads are optional-chained for partial stubs — tests, bespoke
    // viewers — where the template then resolves page-relative.)
    const specifier = resolveClientModuleSpecifier(script.importFrom, {
      resolveClientModule: options.resolveClientModule,
      template: rpc.connectionMeta?.configs?.dock?.clientModuleResolution,
      metaBaseUrl: rpc.connection?.metaBaseUrl,
    })
    try {
      // Keep this a *native* dynamic import in every bundler — the specifier
      // is a runtime URL served by the host, not a build-time module.
      const mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ /* turbopackIgnore: true */ specifier)
      const fn = mod[script.importName ?? 'default']
      if (typeof fn !== 'function')
        return
      const current = entryToStateMap.get(entryId)
      if (!current)
        return
      // Scope the messages client to this entry: its messages default their
      // `category` to the entry id, so the feed can attribute and group them.
      const messages = createMessagesClient(rpc, { defaults: { category: entryId } })
      const scriptContext: DockClientScriptContext = { ...context, current, messages }
      await fn(scriptContext)
    }
    catch (error) {
      loadedScripts.delete(entryId)
      console.error(
        `[@devframes/hub] failed to load client script for "${entryId}" from ${specifier}${clientScriptFailureHint(script.importFrom, specifier)}`,
        error,
      )
    }
  }
}

// ── shared helpers ─────────────────────────────────────────────────────────

function createPanelContext(
  clientType: DockClientType,
  onOpenChange: (open: boolean) => void,
): DocksPanelContext {
  const store: DocksPanelContext['store'] = {
    mode: 'edge',
    width: 480,
    height: 360,
    top: 0,
    left: 0,
    position: 'right',
    inactiveTimeout: 0,
  }
  let open = clientType === 'standalone'
  const session: DocksPanelContext['session'] = {
    get open() {
      return open
    },
    set open(nextOpen) {
      if (nextOpen === open)
        return
      open = nextOpen
      onOpenChange(open)
    },
    selectedDockId: null,
    selectedDockRoute: null,
  }
  return {
    store,
    session,
    isDragging: false,
    isResizing: false,
    get isVertical() {
      return store.position === 'left' || store.position === 'right'
    },
  }
}

function groupByCategory(entries: DevframeDockEntry[], categoryOrder: Record<string, number>): DevframeDockEntriesGrouped {
  // Index registered groups so a member whose `groupId` resolves takes its
  // OUTER bucket from the group's category, not its own (which becomes the
  // member's in-group sub-category). Orphan members — a `groupId` with no
  // registered group — fall back to their own category.
  const groupsById = new Map<string, DevframeDockEntry>()
  for (const entry of entries) {
    if (entry.type === 'group')
      groupsById.set(entry.id, entry)
  }

  const groups = new Map<string, DevframeDockEntry[]>()
  for (const entry of entries) {
    const resolvedGroup = entry.groupId ? groupsById.get(entry.groupId) : undefined
    const category = resolvedGroup
      ? resolvedGroup.category ?? 'default'
      : entry.category ?? 'default'
    let list = groups.get(category)
    if (!list) {
      list = []
      groups.set(category, list)
    }
    list.push(entry)
  }
  return [...groups.entries()].sort(
    ([a], [b]) => (categoryOrder[a] ?? 0) - (categoryOrder[b] ?? 0),
  )
}
