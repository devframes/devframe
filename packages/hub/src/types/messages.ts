import type { EventEmitter } from 'devframe/types'

export type DevframeMessageLevel = 'info' | 'warn' | 'error' | 'success' | 'debug'
export type DevframeMessageEntryFrom = 'server' | 'browser'

export interface DevframeMessageElementPosition {
  /** CSS selector for the element */
  selector?: string
  /** Bounding box of the element */
  boundingBox?: { x: number, y: number, width: number, height: number }
  /** Human-readable description of the element */
  description?: string
}

export interface DevframeMessageFilePosition {
  /** Absolute or relative file path */
  file: string
  /** Line number (1-based) */
  line?: number
  /** Column number (1-based) */
  column?: number
}

export interface DevframeMessageEntry {
  /**
   * Unique identifier for this message entry (auto-generated if not provided)
   */
  id: string
  /**
   * Short title or summary of the message
   */
  message: string
  /**
   * Optional detailed description or explanation
   */
  description?: string
  /**
   * Severity level, determines color and icon
   */
  level: DevframeMessageLevel
  /**
   * Optional stack trace string
   */
  stacktrace?: string
  /**
   * Optional DOM element position info (e.g., for a11y issues)
   */
  elementPosition?: DevframeMessageElementPosition
  /**
   * Optional source file position info (e.g., for lint errors)
   */
  filePosition?: DevframeMessageFilePosition
  /**
   * Whether this message should also appear as a toast notification
   */
  notify?: boolean
  /**
   * Origin of the message entry, automatically set by the context
   */
  from: DevframeMessageEntryFrom
  /**
   * Grouping category (e.g., 'a11y', 'lint', 'runtime', 'test')
   */
  category?: string
  /**
   * Optional tags/labels for filtering
   */
  labels?: string[]
  /**
   * Time in ms to auto-dismiss the toast notification (client-side)
   */
  autoDismiss?: number
  /**
   * Time in ms to auto-delete this message entry (server-side)
   */
  autoDelete?: number
  /**
   * Timestamp when the message was created (auto-generated if not provided)
   */
  timestamp: number
  /**
   * Status of the message entry (e.g., 'loading' while an operation is in progress).
   * Defaults to 'idle' when not specified.
   */
  status?: 'loading' | 'idle'
}

/**
 * Input type for creating a message entry.
 * `id`, `timestamp`, and `from` are auto-filled by the host.
 */
export type DevframeMessageEntryInput = Omit<DevframeMessageEntry, 'id' | 'timestamp' | 'from'> & {
  id?: string
  timestamp?: number
}

export interface DevframeMessageHandle {
  /** The underlying message entry data */
  readonly entry: DevframeMessageEntry
  /** Shortcut to entry.id */
  readonly id: string
  /** Partial update of this message entry */
  update: (patch: Partial<DevframeMessageEntryInput>) => Promise<DevframeMessageEntry | undefined>
  /** Remove this message entry */
  dismiss: () => Promise<void>
}

/**
 * Extra fields accepted by the per-level message shortcuts —
 * everything on {@link DevframeMessageEntryInput} except the
 * `message` and `level` the shortcut itself provides.
 */
export type DevframeMessageShortcutInput = Omit<DevframeMessageEntryInput, 'message' | 'level'>

/**
 * Per-level shortcuts shared by the client and the node host —
 * `messages.info('...')` is `messages.add({ message: '...', level: 'info' })`.
 */
export interface DevframeMessagesLevelShortcuts {
  /** Shortcut for `add({ message, level: 'info', ...extra })` */
  info: (message: string, extra?: DevframeMessageShortcutInput) => Promise<DevframeMessageHandle>
  /** Shortcut for `add({ message, level: 'warn', ...extra })` */
  warn: (message: string, extra?: DevframeMessageShortcutInput) => Promise<DevframeMessageHandle>
  /** Shortcut for `add({ message, level: 'error', ...extra })` */
  error: (message: string, extra?: DevframeMessageShortcutInput) => Promise<DevframeMessageHandle>
  /** Shortcut for `add({ message, level: 'success', ...extra })` */
  success: (message: string, extra?: DevframeMessageShortcutInput) => Promise<DevframeMessageHandle>
  /** Shortcut for `add({ message, level: 'debug', ...extra })` */
  debug: (message: string, extra?: DevframeMessageShortcutInput) => Promise<DevframeMessageHandle>
}

export interface DevframeMessagesClient extends DevframeMessagesLevelShortcuts {
  /**
   * Add a message entry. Returns a Promise resolving to a handle for subsequent updates/dismissal.
   * Can be used without `await` for fire-and-forget usage.
   */
  add: (input: DevframeMessageEntryInput) => Promise<DevframeMessageHandle>
  /** Remove a message entry by id */
  remove: (id: string) => Promise<void>
  /** Clear all message entries */
  clear: () => Promise<void>
}

/**
 * A snapshot or delta of the message list, as returned by
 * {@link DevframeMessagesHost.listSince}. Consumers apply `removedIds`
 * first, then upsert `entries`, and pass `version` back as `since` on the
 * next call.
 */
export interface DevframeMessagesListDelta {
  /** Entries added or updated since the cursor (or all entries when `full`) */
  entries: DevframeMessageEntry[]
  /** Ids removed since the cursor (empty when `full`) */
  removedIds: string[]
  /** The version cursor — pass back as `since` on the next call */
  version: number
  /**
   * When `true`, `entries` is the complete snapshot and any locally cached
   * list must be reset before applying it.
   */
  full: boolean
}

export interface DevframeMessagesHost extends DevframeMessagesLevelShortcuts {
  readonly entries: Map<string, DevframeMessageEntry>
  readonly events: EventEmitter<{
    'message:added': (entry: DevframeMessageEntry) => void
    'message:updated': (entry: DevframeMessageEntry) => void
    'message:removed': (id: string) => void
    'message:cleared': () => void
  }>

  /**
   * Add a new message entry. If an entry with the same `id` already exists, it will be updated instead.
   * Returns a handle for subsequent updates/dismissal. Can be used without `await` for fire-and-forget.
   */
  add: (entry: DevframeMessageEntryInput) => Promise<DevframeMessageHandle>
  /**
   * Update an existing message entry by id (partial update)
   */
  update: (id: string, patch: Partial<DevframeMessageEntryInput>) => Promise<DevframeMessageEntry | undefined>
  /**
   * Remove a message entry by id
   */
  remove: (id: string) => Promise<void>
  /**
   * Clear all message entries
   */
  clear: () => Promise<void>
  /**
   * Read the message list incrementally. Pass the `version` from the
   * previous result as `since` to receive only the entries modified and the
   * ids removed after that point; pass `null`/`undefined` for the initial
   * full snapshot. When the host can no longer compute a reliable delta for
   * the given cursor (trimmed removal history, or a cursor from another host
   * incarnation), the result carries `full: true` with the complete list.
   */
  listSince: (since?: number | null) => DevframeMessagesListDelta
}
