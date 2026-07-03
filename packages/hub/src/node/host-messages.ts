import type {
  DevframeMessageEntry,
  DevframeMessageEntryInput,
  DevframeMessageHandle,
  DevframeMessageShortcutInput,
  DevframeMessagesHost as DevframeMessagesHostType,
  DevframeMessagesListDelta,
} from '../types/messages'
import type { DevframeHubContext } from './context'
import { createEventEmitter } from 'devframe/utils/events'
import { nanoid } from 'devframe/utils/nanoid'

const MAX_ENTRIES = 1000
const MAX_REMOVALS = 1000

export class DevframeMessagesHost implements DevframeMessagesHostType {
  public readonly entries: DevframeMessagesHostType['entries'] = new Map()
  public readonly events: DevframeMessagesHostType['events'] = createEventEmitter()

  /** Tracks when each entry was last added or updated (monotonic) */
  readonly lastModified = new Map<string, number>()
  /** Tracks recently removed entry IDs with their removal time */
  readonly removals: Array<{ id: string, time: number }> = []

  private _autoDeleteTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private _clock = 0
  /**
   * The tick of the newest removal record dropped from the capped
   * `removals` log — cursors older than this can't get a reliable delta
   * and fall back to a full snapshot in {@link listSince}.
   */
  private _removalsTrimmedAt = 0

  private _tick(): number {
    return ++this._clock
  }

  private _recordRemoval(id: string, time: number): void {
    this.removals.push({ id, time })
    if (this.removals.length > MAX_REMOVALS) {
      const dropped = this.removals.splice(0, this.removals.length - MAX_REMOVALS)
      this._removalsTrimmedAt = dropped[dropped.length - 1]!.time
    }
  }

  constructor(
    public readonly context: DevframeHubContext,
  ) {}

  async add(input: DevframeMessageEntryInput): Promise<DevframeMessageHandle> {
    // Dedupe: if an entry with the same explicit id exists, update it instead
    if (input.id && this.entries.has(input.id)) {
      await this.update(input.id, input)
      return this._createHandle(input.id)
    }

    const entry: DevframeMessageEntry = {
      ...input,
      id: input.id ?? nanoid(),
      timestamp: input.timestamp ?? Date.now(),
      from: (input as any).from ?? 'server',
    }

    // FIFO eviction when at capacity
    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value!
      await this.remove(oldest)
    }

    this.entries.set(entry.id, entry)
    this.lastModified.set(entry.id, this._tick())
    this.events.emit('message:added', entry)

    if (entry.autoDelete) {
      this._autoDeleteTimers.set(entry.id, setTimeout(() => {
        this.remove(entry.id)
      }, entry.autoDelete))
    }

    return this._createHandle(entry.id)
  }

  async update(id: string, patch: Partial<DevframeMessageEntryInput>): Promise<DevframeMessageEntry | undefined> {
    const existing = this.entries.get(id)
    if (!existing)
      return undefined

    const updated: DevframeMessageEntry = {
      ...existing,
      ...patch,
      id: existing.id,
      from: existing.from,
      timestamp: existing.timestamp,
    }

    this.entries.set(id, updated)
    this.lastModified.set(id, this._tick())
    this.events.emit('message:updated', updated)

    // Reset autoDelete timer if changed
    if (patch.autoDelete !== undefined) {
      const timer = this._autoDeleteTimers.get(id)
      if (timer) {
        clearTimeout(timer)
        this._autoDeleteTimers.delete(id)
      }
      if (patch.autoDelete) {
        this._autoDeleteTimers.set(id, setTimeout(() => {
          this.remove(id)
        }, patch.autoDelete))
      }
    }

    return updated
  }

  async remove(id: string): Promise<void> {
    const timer = this._autoDeleteTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      this._autoDeleteTimers.delete(id)
    }
    this.entries.delete(id)
    this.lastModified.delete(id)
    this._recordRemoval(id, this._tick())
    this.events.emit('message:removed', id)
  }

  info(message: string, extra?: DevframeMessageShortcutInput): Promise<DevframeMessageHandle> {
    return this.add({ ...extra, message, level: 'info' })
  }

  warn(message: string, extra?: DevframeMessageShortcutInput): Promise<DevframeMessageHandle> {
    return this.add({ ...extra, message, level: 'warn' })
  }

  error(message: string, extra?: DevframeMessageShortcutInput): Promise<DevframeMessageHandle> {
    return this.add({ ...extra, message, level: 'error' })
  }

  success(message: string, extra?: DevframeMessageShortcutInput): Promise<DevframeMessageHandle> {
    return this.add({ ...extra, message, level: 'success' })
  }

  debug(message: string, extra?: DevframeMessageShortcutInput): Promise<DevframeMessageHandle> {
    return this.add({ ...extra, message, level: 'debug' })
  }

  async clear(): Promise<void> {
    for (const timer of this._autoDeleteTimers.values())
      clearTimeout(timer)
    this._autoDeleteTimers.clear()
    const tick = this._tick()
    for (const id of this.entries.keys())
      this._recordRemoval(id, tick)
    this.entries.clear()
    this.lastModified.clear()
    this.events.emit('message:cleared')
  }

  listSince(since?: number | null): DevframeMessagesListDelta {
    const version = this._clock
    // Fall back to a full snapshot when there is no cursor, when the cursor
    // predates removal records already trimmed from the capped log, or when
    // it comes from another host incarnation (ahead of our clock).
    if (since == null || since < this._removalsTrimmedAt || since > version) {
      return {
        entries: Array.from(this.entries.values()),
        removedIds: [],
        version,
        full: true,
      }
    }

    const entries: DevframeMessageEntry[] = []
    for (const [id, entry] of this.entries) {
      const mod = this.lastModified.get(id)
      if (mod != null && mod > since)
        entries.push(entry)
    }
    const removedIds: string[] = []
    for (const removal of this.removals) {
      if (removal.time > since)
        removedIds.push(removal.id)
    }
    return { entries, removedIds, version, full: false }
  }

  private _createHandle(id: string): DevframeMessageHandle {
    // eslint-disable-next-line ts/no-this-alias
    const host = this
    return {
      get entry() { return host.entries.get(id)! },
      get id() { return id },
      update: patch => host.update(id, patch),
      dismiss: () => host.remove(id),
    }
  }
}
