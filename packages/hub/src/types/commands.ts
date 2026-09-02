import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventEmitter } from 'devframe/types'
import type { DevframeDockEntryIcon } from './docks'

export interface DevframeCommandKeybinding {
  /**
   * Keyboard shortcut string.
   * Use "Mod" for platform-aware modifier (Cmd on macOS, Ctrl elsewhere).
   * Examples: "Mod+K", "Mod+Shift+P", "Alt+N"
   */
  key: string
}

export interface DevframeCommandBase {
  /**
   * Unique namespaced ID, e.g. "vite:open-in-editor"
   */
  id: string
  title: string
  description?: string
  /**
   * Icon for the command. Either an Iconify icon string (e.g. "ph:pencil-duotone")
   * or a theme-specific pair `{ light, dark }` - the same shape as dock icons.
   */
  icon?: DevframeDockEntryIcon
  category?: string
  /**
   * Whether to show in command palette. Default: true
   *
   * - `true` - show the command and flatten its children into search results
   * - `false` - hide the command entirely from the palette
   * - `'without-children'` - show the command but don't flatten children into top-level search (children are still accessible via drill-down)
   */
  showInPalette?: boolean | 'without-children'
  /**
   * Optional context expression for conditional visibility.
   * When set, the command is only shown in the palette and only executable
   * when the expression evaluates to true.
   */
  when?: string
  /**
   * Default keyboard shortcut(s) for this command
   */
  keybindings?: DevframeCommandKeybinding[]
}

/**
 * Opt-in agent exposure for a server command - mirrors the `agent` field on
 * `defineRpcFunction`. A command carrying this field (and a `handler`) is
 * projected into `ctx.agent` as a callable tool, reaching MCP clients through
 * the devframe MCP adapter.
 *
 * `when` clauses are evaluated client-side only and are **not** enforced for
 * agent calls - opt in a `when`-gated command only if running it outside its
 * UI context is safe.
 */
export interface DevframeCommandAgentOptions {
  /**
   * Description shown to the agent. Write it as a prompt: state when to call
   * the command, not just what it does.
   */
  description: string
  /** Display title (falls back to the command's `title`). */
  title?: string
  /**
   * Safety classification - drives MCP hint annotations.
   * @default 'action'
   */
  safety?: 'read' | 'action' | 'destructive'
  /** Free-form tags for grouping/filtering. */
  tags?: readonly string[]
  /**
   * Positional [Standard Schema](https://standardschema.dev/) validators for
   * the handler's arguments - the same shape RPC definitions carry (valibot,
   * zod, arktype, devframe's built-in `s` builder, …). Each is advertised
   * under `arg0` / `arg1` / … on the tool's JSON-Schema input. Omitted: the
   * tool takes no arguments.
   */
  args?: readonly StandardSchemaV1[]
}

/**
 * Server command input - what plugins pass to `ctx.commands.register()`.
 */
export interface DevframeServerCommandInput extends DevframeCommandBase {
  /**
   * Handler for this command. Optional if the command only serves as a group for children.
   */
  handler?: (...args: any[]) => any | Promise<any>
  /**
   * Opt this command in to the agent surface (`ctx.agent` → MCP). Requires a
   * `handler`. See {@link DevframeCommandAgentOptions}.
   */
  agent?: DevframeCommandAgentOptions
  /**
   * Static sub-commands. Two levels max (parent → children).
   * Each child must have a globally unique `id`.
   */
  children?: DevframeServerCommandInput[]
}

/**
 * Serializable server command entry - sent over RPC (no handler).
 */
export interface DevframeServerCommandEntry extends DevframeCommandBase {
  source: 'server'
  children?: DevframeServerCommandEntry[]
}

/**
 * Client command - registered in the webcomponent context.
 */
export interface DevframeClientCommand extends DevframeCommandBase {
  source: 'client'
  /**
   * Action for this command. Optional if the command only serves as a group for children.
   * Return sub-commands for dynamic nested palette menus (runtime submenus).
   */
  action?: (...args: any[]) => void | DevframeClientCommand[] | Promise<void | DevframeClientCommand[]>
  /**
   * Static sub-commands. Two levels max (parent → children).
   */
  children?: DevframeClientCommand[]
}

/**
 * Union of command entries visible in the palette.
 */
export type DevframeCommandEntry = DevframeServerCommandEntry | DevframeClientCommand

export interface DevframeCommandHandle {
  readonly id: string
  update: (patch: Partial<Omit<DevframeServerCommandInput, 'id'>>) => void
  unregister: () => void
}

export interface DevframeCommandsHostEvents {
  'commands:registered': (command: DevframeServerCommandEntry) => void
  'commands:unregistered': (id: string) => void
}

export interface DevframeCommandsHost {
  readonly commands: Map<string, DevframeServerCommandInput>
  readonly events: EventEmitter<DevframeCommandsHostEvents>

  /**
   * Register a command (with optional children).
   */
  register: (command: DevframeServerCommandInput) => DevframeCommandHandle

  /**
   * Unregister a command by ID (removes parent and all children).
   */
  unregister: (id: string) => boolean

  /**
   * Execute a command by ID. Searches top-level and children.
   * Throws if not found or if command has no handler.
   */
  execute: (id: string, ...args: any[]) => Promise<unknown>

  /**
   * Returns serializable list (no handlers), preserving tree structure.
   */
  list: () => DevframeServerCommandEntry[]
}

export interface DevframeCommandShortcutOverrides {
  /**
   * Command ID → keybinding overrides. Empty array = shortcut disabled.
   */
  [commandId: string]: DevframeCommandKeybinding[]
}
