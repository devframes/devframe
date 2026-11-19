import type {
  DevframeTracePhase,
  DevframeTraceRecord,
  DevframeTracingChannelInfo,
  DevframeTracingChannelSource,
  DevframeTracingOptions,
  DevframeTracingRecorder,
  DevframeTracingSourceEvent,
} from 'devframe/types'
import type { TracingChannel, TracingChannelSubscribers } from 'node:diagnostics_channel'
import * as diagnosticsChannel from 'node:diagnostics_channel'
import { nanoid } from 'devframe/utils/nanoid'
import { diagnostics } from './diagnostics'
import { detectServerRuntime } from './runtime'
import { serializeTraceValue } from './tracing-serialize'

export const TRACING_RECORD_BUFFER = 500

/** Later sources win when the same name arrives twice. */
const SOURCE_RANK: Record<DevframeTracingChannelSource, number> = {
  adhoc: 0,
  builtin: 1,
  config: 2,
  registered: 3,
}

export type TracingModule = Pick<typeof diagnosticsChannel, 'channel'> & Partial<Pick<typeof diagnosticsChannel, 'tracingChannel'>>

interface ChannelEntry {
  info: DevframeTracingChannelInfo
  channel: TracingChannel
  records: DevframeTraceRecord[]
  byContext: WeakMap<object, DevframeTraceRecord>
  subscribers?: Partial<TracingChannelSubscribers<object>>
}

/**
 * Subscribes to Tracing Channels and folds their lifecycle events into
 * records. Has no wire: `ctx.tracing` uses one internally, and a tool can
 * keep its own and attach it with `ctx.tracing.attach()`.
 */
export class TracingRecorder implements DevframeTracingRecorder {
  readonly supported: boolean
  private readonly entries = new Map<string, ChannelEntry>()
  private readonly listeners = new Set<(event: DevframeTracingSourceEvent) => void>()
  private warnedUnsupported = false

  constructor(private readonly module: TracingModule = diagnosticsChannel) {
    this.supported = typeof module.tracingChannel === 'function'
  }

  register(channel: string | TracingChannel, meta?: { description?: string }): TracingChannel {
    const name = typeof channel === 'string'
      ? channel
      : baseName(channel)
    return this.add(name, 'registered', meta?.description, typeof channel === 'string'
      ? undefined
      : channel).channel
  }

  applyOptions(options: DevframeTracingOptions | undefined): void {
    for (const entry of options?.channels ?? []) {
      const { name, description } = typeof entry === 'string'
        ? { name: entry, description: undefined }
        : entry
      this.add(name, 'config', description)
    }
  }

  list(): DevframeTracingChannelInfo[] {
    return Array.from(this.entries.values(), entry => ({ ...entry.info }))
  }

  record(name: string): void {
    if (!this.supported) {
      if (!this.warnedUnsupported) {
        this.warnedUnsupported = true
        diagnostics.DF0086({
          runtime: detectServerRuntime(),
        })
      }
      return
    }
    const entry = this.add(name, 'adhoc')
    if (entry.subscribers)
      return
    entry.info.recording = true
    entry.subscribers = {
      start: message => this.onPhase(entry, 'start', message),
      end: message => this.onPhase(entry, 'end', message),
      asyncStart: message => this.onPhase(entry, 'asyncStart', message),
      asyncEnd: message => this.onPhase(entry, 'asyncEnd', message),
      error: message => this.onPhase(entry, 'error', message),
    }
    entry.channel.subscribe(entry.subscribers)
    this.emit({ type: 'channels' })
  }

  stop(name: string): void {
    const entry = this.entries.get(name)
    if (!entry?.subscribers)
      return
    entry.channel.unsubscribe(entry.subscribers)
    entry.subscribers = undefined
    entry.info.recording = false
    this.emit({ type: 'channels' })
  }

  records(name: string): DevframeTraceRecord[] {
    return (this.entries.get(name)?.records ?? []).map(record => ({ ...record }))
  }

  clear(name: string): void {
    const entry = this.entries.get(name)
    if (!entry)
      return
    entry.records = []
    entry.byContext = new WeakMap()
    entry.info.count = 0
    this.emit({ type: 'clear', channel: name })
    this.emit({ type: 'channels' })
  }

  onRecord(name: string, fn: (record: DevframeTraceRecord) => void): () => void {
    this.add(name, 'adhoc')
    return this.subscribe((event) => {
      if (event.type === 'record' && event.record.channel === name)
        fn(event.record)
    })
  }

  subscribe(listener: (event: DevframeTracingSourceEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  add(name: string, source: DevframeTracingChannelSource, description?: string, channel?: TracingChannel): ChannelEntry {
    let entry = this.entries.get(name)
    let changed = false
    if (!entry) {
      entry = {
        info: {
          name,
          source,
          recording: false,
          count: 0,
        },
        channel: channel ?? this.createChannel(name),
        records: [],
        byContext: new WeakMap(),
      }
      this.entries.set(name, entry)
      changed = true
    }
    else if (SOURCE_RANK[source] > SOURCE_RANK[entry.info.source]) {
      entry.info.source = source
      changed = true
    }
    if (description && !entry.info.description) {
      entry.info.description = description
      changed = true
    }
    if (changed)
      this.emit({ type: 'channels' })
    return entry
  }

  private emit(event: DevframeTracingSourceEvent): void {
    for (const listener of this.listeners)
      listener(event)
  }

  private createChannel(name: string): TracingChannel {
    if (this.module.tracingChannel)
      return this.module.tracingChannel(name)
    return noopTracingChannel(this.module, name)
  }

  private onPhase(entry: ChannelEntry, phase: DevframeTracePhase, message: unknown): void {
    const at = Date.now()
    const keyed = typeof message === 'object' && message !== null
    const record = (keyed
      ? entry.byContext.get(message)
      : undefined) ?? this.openRecord(entry, at, keyed ? message : undefined)

    record.events.push({ phase, at })
    record.duration = at - record.startedAt
    const { result, error, ...rest } = keyed
      ? (message as { result?: unknown, error?: unknown })
      : {}
    record.context = serializeTraceValue(keyed ? rest : message)
    if (result !== undefined)
      record.result = serializeTraceValue(result)
    if (phase === 'error') {
      record.status = 'error'
      const serialized = serializeTraceValue(error)
      record.error = isErrorShape(serialized)
        ? serialized
        : {
            name: 'Error',
            message: String(error),
          }
    }
    else if ((phase === 'end' || phase === 'asyncEnd') && record.status === 'pending') {
      record.status = 'ok'
    }

    const snapshot = {
      ...record,
      events: [...record.events],
    }
    this.emit({ type: 'record', record: snapshot })
  }

  private openRecord(entry: ChannelEntry, at: number, context: object | undefined): DevframeTraceRecord {
    const record: DevframeTraceRecord = {
      id: nanoid(),
      channel: entry.info.name,
      startedAt: at,
      status: 'pending',
      context: null,
      events: [],
    }
    if (context)
      entry.byContext.set(context, record)
    entry.records.push(record)
    if (entry.records.length > TRACING_RECORD_BUFFER)
      entry.records.shift()
    entry.info.count = entry.records.length
    return record
  }
}

/**
 * Create a standalone Tracing Channel recorder. A tool keeps one as its own
 * tracing instance, records through it, and optionally shows it in devframe
 * with `ctx.tracing.attach(recorder)`.
 */
export function createTracingRecorder(): DevframeTracingRecorder {
  return new TracingRecorder()
}

/** `tracing:<name>:start` → `<name>`. */
function baseName(channel: TracingChannel): string {
  const name = String(channel.start.name)
  return name.replace(/^tracing:/, '').replace(/:start$/, '')
}

function isErrorShape(value: unknown): value is { name: string, message: string, stack?: string } {
  return typeof value === 'object' && value !== null && typeof (value as { name?: unknown }).name === 'string' && typeof (value as { message?: unknown }).message === 'string'
}

/**
 * Stand-in for runtimes without `tracingChannel`: the trace helpers call
 * the function directly and nothing is published.
 */
function noopTracingChannel(module: TracingModule, name: string): TracingChannel {
  return {
    start: module.channel(`tracing:${name}:start`),
    end: module.channel(`tracing:${name}:end`),
    asyncStart: module.channel(`tracing:${name}:asyncStart`),
    asyncEnd: module.channel(`tracing:${name}:asyncEnd`),
    error: module.channel(`tracing:${name}:error`),
    hasSubscribers: false,
    subscribe() {},
    unsubscribe() {},
    traceSync: (fn, _context, thisArg, ...args) => Reflect.apply(fn, thisArg, args),
    tracePromise: (fn, _context, thisArg, ...args) => Reflect.apply(fn, thisArg, args),
    traceCallback: (fn, _position, _context, thisArg, ...args) => Reflect.apply(fn, thisArg, args),
  }
}
