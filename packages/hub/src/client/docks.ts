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
  open: boolean
  inactiveTimeout: number
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
   * The live connection status of the underlying devframe client, so a viewer
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
  isDragging: boolean
  isResizing: boolean
  readonly isVertical: boolean
}

export interface DocksEntriesContext {
  selectedId: string | null
  readonly selected: DevframeDockEntry | null
  entries: DevframeDockEntry[]
  entryToStateMap: Map<string, DockEntryState>
  groupedEntries: DevframeDockEntriesGrouped
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
