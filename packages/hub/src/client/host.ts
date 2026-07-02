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
import { connectDevframe } from 'devframe/client'
import { createEventEmitter } from 'devframe/utils/events'
import { DEFAULT_CATEGORIES_ORDER, DEFAULT_STATE_USER_SETTINGS } from '../constants'
import { setDevframeClientContext } from './context'
import { createMessagesClient } from './messages'

const DOCKS_STATE_KEY = 'devframe:docks'
const COMMANDS_STATE_KEY = 'devframe:commands'
const USER_SETTINGS_STATE_KEY = 'devframe:user-settings'

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

  const [docksState, commandsState, settings] = await Promise.all([
    rpc.sharedState.get<DevframeDockEntry[]>(DOCKS_STATE_KEY, { initialValue: [] }),
    rpc.sharedState.get<DevframeServerCommandEntry[]>(COMMANDS_STATE_KEY, { initialValue: [] }),
    rpc.sharedState.get<DevframeDocksUserSettings>(USER_SETTINGS_STATE_KEY, {
      initialValue: DEFAULT_STATE_USER_SETTINGS(),
    }),
  ])

  let selectedId: string | null = null
  const entryToStateMap = new Map<string, DockEntryState>()

  const panel = createPanelContext(clientType)
  const docks = createDocksContext()
  const commands = createCommandsContext()
  const when: WhenClauseContext = {
    get context(): WhenContext {
      return {
        clientType,
        dockOpen: panel.store.open,
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
    when,
  }

  const disposers: Array<() => void> = []
  reconcileEntries()
  disposers.push(docksState.on('updated', reconcileEntries))

  setDevframeClientContext(context)

  const messages = createMessagesClient(rpc)
  const loadedScripts = new Set<string>()
  if (options.loadClientScripts ?? true) {
    loadClientScripts()
    disposers.push(docksState.on('updated', loadClientScripts))
  }

  return {
    context,
    dispose() {
      for (const off of disposers.splice(0)) off()
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

  function reconcileEntries(): void {
    const entries = docksState.value() as DevframeDockEntry[]
    const seen = new Set<string>()

    for (const meta of entries) {
      seen.add(meta.id)
      const existing = entryToStateMap.get(meta.id)
      if (!existing) {
        entryToStateMap.set(meta.id, createDockEntryState(meta))
      }
      else if (existing.entryMeta !== meta) {
        existing.entryMeta = meta
        existing.events.emit('entry:updated', meta as any)
      }
    }
    for (const id of [...entryToStateMap.keys()]) {
      if (!seen.has(id))
        entryToStateMap.delete(id)
    }

    docks.entries = entries
    docks.groupedEntries = groupByCategory(entries)
    if (selectedId && !entryToStateMap.has(selectedId))
      selectedId = null
  }

  function createDocksContext(): DocksEntriesContext {
    const ctx: DocksEntriesContext = {
      get selectedId() {
        return selectedId
      },
      set selectedId(id: string | null) {
        void switchEntry(id)
      },
      get selected() {
        return (selectedId && entryToStateMap.get(selectedId)?.entryMeta) || null
      },
      entries: [],
      entryToStateMap,
      groupedEntries: [],
      settings,
      getStateById: id => entryToStateMap.get(id),
      switchEntry,
      toggleEntry: id => (selectedId === id ? switchEntry(null) : switchEntry(id)),
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
        return (rpc.call as (name: string, ...a: any[]) => Promise<unknown>)('hub:commands:execute', id, ...args)
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

  // ── client scripts ───────────────────────────────────────────────────────

  function clientScriptOf(entry: DevframeDockEntry): ClientScriptEntry | undefined {
    return (entry as any).action ?? (entry as any).renderer ?? (entry as any).clientScript
  }

  function loadClientScripts(): void {
    for (const entry of docksState.value() as DevframeDockEntry[]) {
      const script = clientScriptOf(entry)
      if (!script?.importFrom || loadedScripts.has(entry.id))
        continue
      loadedScripts.add(entry.id)
      void runClientScript(entry.id, script)
    }
  }

  async function runClientScript(entryId: string, script: ClientScriptEntry): Promise<void> {
    try {
      // Keep this a *native* dynamic import in every bundler — the specifier
      // is a runtime URL served by the host, not a build-time module.
      const mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ /* turbopackIgnore: true */ script.importFrom)
      const fn = mod[script.importName ?? 'default']
      if (typeof fn !== 'function')
        return
      const current = entryToStateMap.get(entryId)
      if (!current)
        return
      const scriptContext: DockClientScriptContext = { ...context, current, messages }
      await fn(scriptContext)
    }
    catch (error) {
      loadedScripts.delete(entryId)
      console.error(`[@devframes/hub] failed to load client script for "${entryId}" from ${script.importFrom}`, error)
    }
  }
}

// ── shared helpers ─────────────────────────────────────────────────────────

function createPanelContext(clientType: DockClientType): DocksPanelContext {
  const store: DocksPanelContext['store'] = {
    mode: 'edge',
    width: 480,
    height: 360,
    top: 0,
    left: 0,
    position: 'right',
    // A standalone runtime owns the page, so its "panel" is always open.
    open: clientType === 'standalone',
    inactiveTimeout: 0,
  }
  return {
    store,
    isDragging: false,
    isResizing: false,
    get isVertical() {
      return store.position === 'left' || store.position === 'right'
    },
  }
}

function groupByCategory(entries: DevframeDockEntry[]): DevframeDockEntriesGrouped {
  const groups = new Map<string, DevframeDockEntry[]>()
  for (const entry of entries) {
    const category = entry.category ?? 'default'
    let list = groups.get(category)
    if (!list) {
      list = []
      groups.set(category, list)
    }
    list.push(entry)
  }
  return [...groups.entries()].sort(
    ([a], [b]) => (DEFAULT_CATEGORIES_ORDER[a] ?? 0) - (DEFAULT_CATEGORIES_ORDER[b] ?? 0),
  )
}
