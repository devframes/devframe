import type {
  DevframeMessageEntry,
  DevframeMessageEntryInput,
  DevframeMessageHandle,
  DevframeMessagesHost as DevframeMessagesHostType,
} from '../types/messages'
import type { DevframeHubContext } from './context'
import { createEventEmitter } from 'devframe/utils/events'
import { nanoid } from 'devframe/utils/nanoid'

const MAX_ENTRIES = 1000
const MAX_REMOVALS = 1000

function recordRemoval(
  removals: Array<{ id: string, time: number }>,
  id: string,
  time: number,
): void {
  removals.push({ id, time })
  if (removals.length > MAX_REMOVALS)
    removals.splice(0, removals.length - MAX_REMOVALS)
}

export class DevframeMessagesHost implements DevframeMessagesHostType {
  public readonly entries: DevframeMessagesHostType['entries'] = new Map()
  public readonly events: DevframeMessagesHostType['events'] = createEventEmitter()

  /** Tracks when each entry was last added or updated (monotonic) */
  readonly lastModified = new Map<string, number>()
  /** Tracks recently removed entry IDs with their removal time */
  readonly removals: Array<{ id: string, time: number }> = []

  private _autoDeleteTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private _clock = 0

  private _tick(): number {
    return ++this._clock
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
    recordRemoval(this.removals, id, this._tick())
    this.events.emit('message:removed', id)
  }

  async clear(): Promise<void> {
    for (const timer of this._autoDeleteTimers.values())
      clearTimeout(timer)
    this._autoDeleteTimers.clear()
    const tick = this._tick()
    for (const id of this.entries.keys())
      recordRemoval(this.removals, id, tick)
    this.entries.clear()
    this.lastModified.clear()
    this.events.emit('message:cleared')
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
