import type { DevframeConnectionStatus, DevframeRpcContext, RpcClientEvents } from 'devframe/client'
import type { EventEmitter } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { WhenContext } from 'devframe/utils/when'
import type { DevframeClientCommand, DevframeCommandEntry, DevframeCommandKeybinding } from '../types/commands'
import type { DevframeDockEntriesGrouped, DevframeDockEntry, DevframeDockUserEntry } from '../types/docks'
import type { DevframeDocksUserSettings } from '../types/settings'
import type { DockRenderersContext } from './renderers'

export type { DevframeClientRpcHost, RpcClientEvents } from 'devframe/client'

export interface DockPanelStorage {
  mode: 'float' | 'edge'
  width: number
  height: number
  top: number
  left: number
  position: 'left' | 'right' | 'bottom' | 'top'
  inactiveTimeout: number
}

/**
 * Per-tab UI state of the dock panel, distinct from the browser-shared geometry
 * in {@link DockPanelStorage}. A hub UI provider persists this to `sessionStorage` so a
 * reload (or the RPC auth handshake that follows one) restores the panel to
 * exactly where the developer left it — which dock was open, and the
 * address-bar route of that dock's iframe. Kept `sessionStorage`-scoped (not
 * `localStorage`) because it is per-tab navigation state: two tabs open against
 * the same dev server each keep their own selection rather than fighting over a
 * shared one. Every field is serializable.
 */
export interface DockSessionStorage {
  /** Whether the dock panel is open. */
  open: boolean
  /** The currently selected dock entry id, or `null` when nothing is open. */
  selectedDockId: string | null
  /**
   * The live address-bar URL of the selected iframe dock, restored as that
   * iframe's boot `src` on the next load so the deep-linked route survives a
   * reload. `null` when the selected dock has no iframe route to remember.
   */
  selectedDockRoute: string | null
  /**
   * The dock entry most recently selected from beyond the float bar's inline
   * capacity — from the overflow popover or from inside a dock group. A hub UI
   * provider raises this entry into a dedicated slot between the bar's visible
   * items and the overflow button, so deselecting it (or selecting a visible
   * neighbour) keeps it one click away instead of folding it straight back
   * into the overflow. `null` (or absent, for stores persisted before this
   * field existed) when no entry has been raised.
   */
  recentDockId?: string | null
  /**
   * The member most recently opened in each dock group, keyed by group id.
   * Recorded whenever a grouped member is selected (from the group popover,
   * the group sidebar, the command palette, or an RPC activation), and read
   * back when the group is activated again: the remembered member reopens
   * directly, taking precedence over the group's own
   * {@link import('../types/docks').DevframeViewGroup.defaultChildId defaultChildId}.
   * A group is only listed once one of its members has been opened this tab
   * (absent for stores persisted before this field existed).
   */
  groupLastChildIds?: Record<string, string>
}

export type DockClientType = 'embedded' | 'standalone'

export interface DocksContext extends DevframeRpcContext {
  /**
   * Type of the client environment
   *
   * 'embedded' - running inside an embedded floating panel
   * 'standalone' - running inside a standalone window (no user app)
   */
  readonly clientType: 'embedded' | 'standalone'
  /**
   * The panel context
   */
  readonly panel: DocksPanelContext
  /**
   * The docks entries context
   */
  readonly docks: DocksEntriesContext
  /**
   * The commands context for command palette and shortcuts
   */
  readonly commands: CommandsContext
  /**
   * The when-clause context for conditional visibility
   */
  readonly when: WhenClauseContext
  /**
   * The live connection status of the underlying RPC client, so a hub UI provider
   * can render one central connection indicator for every docked plugin
   * instead of each plugin surfacing its own.
   */
  readonly connection: DocksConnectionContext
  /**
   * The dock-renderer registry. Routes a dock `type` to a host-registered
   * renderer (e.g. `@devframes/json-render-ui` for `'json-render'`). The hub
   * itself ships no renderers.
   */
  readonly renderers: DockRenderersContext
}

export interface DocksConnectionContext {
  /** The current connection status. */
  readonly status: DevframeConnectionStatus
  /** The most recent connection-level error, or `null` when healthy. */
  readonly error: Error | null
  /**
   * The client's event emitter — subscribe to `connection:status`,
   * `connection:error`, and `rpc:error` to react to changes.
   */
  readonly events: EventEmitter<RpcClientEvents>
}

export interface WhenClauseContext {
  /**
   * Get the current when-clause context snapshot.
   * Returns a reactive object with built-in variables and any custom plugin variables.
   */
  readonly context: WhenContext
}

export type DevframeClientContext = DocksContext

export interface DocksPanelContext {
  store: DockPanelStorage
  /**
   * Per-tab session UI state — whether the panel is open, which dock is
   * selected, and that dock's iframe route. Restored across reloads (and the
   * auth handshake that follows one) by a hub UI provider that persists it to
   * `sessionStorage`.
   */
  session: DockSessionStorage
  isDragging: boolean
  isResizing: boolean
  readonly isVertical: boolean
  /**
   * Claim the persisted {@link DockSessionStorage.selectedDockRoute boot route} for a dock
   * id, once. Returns the saved address-bar URL only for the dock that was
   * selected before the last reload — and only on the first call for it — so a
   * restored iframe boots deep-linked while a later switch to a different dock
   * (whose live route isn't reflected in {@link DockSessionStorage.selectedDockRoute} yet)
   * doesn't reuse the stale value. Returns `null` otherwise.
   */
  consumeBootRoute?: (id: string) => string | null
}

export interface DocksEntriesContext {
  selectedId: string | null
  selectedRoute: string | null
  readonly selected: DevframeDockEntry | null
  entries: DevframeDockEntry[]
  entryToStateMap: Map<string, DockEntryState>
  groupedEntries: DevframeDockEntriesGrouped
  /**
   * The resolved top-level category ordering — `DEFAULT_CATEGORIES_ORDER`,
   * overridden by every installed devframe's own `dock.categoryOrder`
   * (`ConnectionMeta.configs.dock.categoryOrder`), overridden again by the
   * host page's own `createDevframeClientRuntime({ categoryOrder })`. Fixed
   * for the life of the session — resolved once at boot.
   */
  readonly categoryOrder: Record<string, number>
  settings: SharedState<DevframeDocksUserSettings>
  /**
   * Get the state of a dock entry by its ID
   */
  getStateById: (id: string) => DockEntryState | undefined
  /**
   * Switch to the selected dock entry, pass `null` to clear the selection
   *
   * @returns Whether the selection was changed successfully
   */
  switchEntry: (id?: string | null) => Promise<boolean>
  /**
   * Toggle the selected dock entry
   *
   * @returns Whether the selection was changed successfully
   */
  toggleEntry: (id: string) => Promise<boolean>
  /**
   * Register a **client-only** dock entry, live in this page and merged with
   * the server-provided docks (`devframe:docks` shared state) into
   * {@link entries}. Unlike a dock registered on the node
   * {@link import('../types/docks').DevframeDocksHost}, it never flows into
   * shared state, so it stays local to this client instead of syncing to the
   * hub or other hub UI providers — for a view the client runtime synthesizes itself.
   *
   * Throws when `id` already names a client dock, unless `force` is set. A
   * client dock sharing an id with a server dock overrides it in the local
   * merge. Returns a handle to {@link DockRegistration.update patch} or
   * {@link DockRegistration.dispose remove} it.
   */
  register: <T extends DevframeDockEntry>(entry: T, force?: boolean) => DockRegistration<T>
  /**
   * Replace a previously {@link register client-registered} dock entry, keyed
   * by `id`. Throws when no client dock owns that id.
   */
  update: (entry: DevframeDockUserEntry) => void
}

export interface DockRegistration<T extends DevframeDockEntry = DevframeDockEntry> {
  /**
   * Patch the registered client dock in place. The `id` is immutable — passing
   * a differing `id` throws.
   */
  update: (patch: Partial<T>) => void
  /** Remove the client dock from the local merge. */
  dispose: () => void
}

export interface DockEntryState {
  entryMeta: DevframeDockEntry
  readonly isActive: boolean
  domElements: {
    iframe?: HTMLIFrameElement | null
    panel?: HTMLDivElement | null
  }
  events: EventEmitter<DockEntryStateEvents>
}

export interface DockEntryStateEvents {
  'entry:activated': () => void
  'entry:deactivated': () => void
  'entry:updated': (newMeta: DevframeDockUserEntry) => void
  'dom:panel:mounted': (panel: HTMLDivElement) => void
  'dom:iframe:mounted': (iframe: HTMLIFrameElement) => void
}

export interface CommandsContext {
  /**
   * All commands (server + client)
   */
  readonly commands: DevframeCommandEntry[]
  /**
   * Palette-visible commands only (filtered by `showInPalette !== false`)
   */
  readonly paletteCommands: DevframeCommandEntry[]
  /**
   * Register client-side command(s). Returns cleanup function.
   */
  register: (cmd: DevframeClientCommand | DevframeClientCommand[]) => () => void
  /**
   * Execute a command by ID. Delegates to RPC for server commands.
   */
  execute: (id: string, ...args: any[]) => Promise<unknown>
  /**
   * Get effective keybindings for a command (defaults merged with overrides)
   */
  getKeybindings: (id: string) => DevframeCommandKeybinding[]
  /**
   * User settings store (persisted, includes command shortcuts)
   */
  settings: SharedState<DevframeDocksUserSettings>
  /**
   * Whether the command palette is open
   */
  paletteOpen: boolean
}
