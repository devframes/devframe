import type {
  DevframeNodeContext,
  DevframeTracePhase,
  DevframeTraceRecord,
  DevframeTracingChannelInfo,
  DevframeTracingChannelSource,
  DevframeTracingHost,
  DevframeTracingOptions,
  RpcStreamingChannel,
} from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { StreamSink } from 'devframe/utils/streaming-channel'
import type { TracingChannel, TracingChannelSubscribers } from 'node:diagnostics_channel'
import * as diagnosticsChannel from 'node:diagnostics_channel'
import { nanoid } from 'devframe/utils/nanoid'
import { DEVFRAME_EVENTS } from '../events'
import { diagnostics } from './diagnostics'
import { detectServerRuntime } from './runtime'
import { serializeTraceValue } from './tracing-serialize'

export const TRACING_RECORD_BUFFER = 500
const COUNT_FLUSH_MS = 100

/** Tracing Channels Node.js itself publishes. */
const BUILTIN_CHANNELS: Record<string, string> = {
  'module.require': 'Every CommonJS require() call',
  'net.server.listen': 'net.Server listen() calls',
}

/** Later sources win when the same name arrives twice. */
const SOURCE_RANK: Record<DevframeTracingChannelSource, number> = {
  adhoc: 0,
  builtin: 1,
  config: 2,
  registered: 3,
}

type TracingModule = Pick<typeof diagnosticsChannel, 'channel'> & Partial<Pick<typeof diagnosticsChannel, 'tracingChannel'>>

interface ChannelEntry {
  info: DevframeTracingChannelInfo
  channel: TracingChannel
  records: DevframeTraceRecord[]
  byContext: WeakMap<object, DevframeTraceRecord>
  subscribers?: Partial<TracingChannelSubscribers<object>>
  sink?: StreamSink<DevframeTraceRecord>
  listeners: Set<(record: DevframeTraceRecord) => void>
}

export class DevframeTracingHostImpl implements DevframeTracingHost {
  readonly supported: boolean
  private readonly entries = new Map<string, ChannelEntry>()
  private readonly stream: RpcStreamingChannel<DevframeTraceRecord>
  private readonly state: Promise<SharedState<Record<string, DevframeTracingChannelInfo>>>
  private countTimer: ReturnType<typeof setTimeout> | undefined
  private warnedUnsupported = false

  constructor(
    private readonly context: DevframeNodeContext,
    private readonly module: TracingModule = diagnosticsChannel,
  ) {
    this.supported = typeof module.tracingChannel === 'function'
    this.stream = context.rpc.streaming.create<DevframeTraceRecord>(DEVFRAME_EVENTS.stream.tracing, {
      replayWindow: TRACING_RECORD_BUFFER,
      closedStreamRetention: 0,
    })
    this.state = context.rpc.sharedState.get<Record<string, DevframeTracingChannelInfo>>(
      DEVFRAME_EVENTS.sharedState.tracingChannels,
      { initialValue: {} },
    )
    for (const [name, description] of Object.entries(BUILTIN_CHANNELS))
      this.add(name, 'builtin', description)
    this.registerRpc()
  }

  _applyOptions(options: DevframeTracingOptions | undefined): void {
    for (const entry of options?.channels ?? []) {
      const { name, description } = typeof entry === 'string' ? { name: entry, description: undefined } : entry
      this.add(name, 'config', description)
    }
  }

  register(channel: string | TracingChannel, meta?: { description?: string }): TracingChannel {
    const name = typeof channel === 'string' ? channel : baseName(channel)
    return this.add(name, 'registered', meta?.description, typeof channel === 'string' ? undefined : channel).channel
  }

  list(): DevframeTracingChannelInfo[] {
    return Array.from(this.entries.values(), entry => ({ ...entry.info }))
  }

  record(name: string): void {
    if (!this.supported) {
      if (!this.warnedUnsupported) {
        this.warnedUnsupported = true
        diagnostics.DF0081({ runtime: detectServerRuntime() })
      }
      return
    }
    const entry = this.add(name, 'adhoc')
    if (entry.subscribers)
      return
    entry.sink = this.stream.start()
    entry.info.recording = true
    entry.info.streamId = entry.sink.id
    entry.subscribers = {
      start: message => this.onPhase(entry, 'start', message),
      end: message => this.onPhase(entry, 'end', message),
      asyncStart: message => this.onPhase(entry, 'asyncStart', message),
      asyncEnd: message => this.onPhase(entry, 'asyncEnd', message),
      error: message => this.onPhase(entry, 'error', message),
    }
    entry.channel.subscribe(entry.subscribers)
    void this.publish()
  }

  stop(name: string): void {
    const entry = this.entries.get(name)
    if (!entry?.subscribers)
      return
    entry.channel.unsubscribe(entry.subscribers)
    entry.subscribers = undefined
    entry.sink?.close()
    entry.sink = undefined
    entry.info.recording = false
    entry.info.streamId = undefined
    void this.publish()
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
    if (entry.sink) {
      // A fresh stream drops the replay buffer, so a client that reconnects
      // after a clear does not see the cleared records again.
      entry.sink.close()
      entry.sink = this.stream.start()
      entry.info.streamId = entry.sink.id
    }
    void this.publish()
  }

  onRecord(name: string, fn: (record: DevframeTraceRecord) => void): () => void {
    const entry = this.add(name, 'adhoc')
    entry.listeners.add(fn)
    return () => {
      entry.listeners.delete(fn)
    }
  }

  private add(name: string, source: DevframeTracingChannelSource, description?: string, channel?: TracingChannel): ChannelEntry {
    let entry = this.entries.get(name)
    if (!entry) {
      entry = {
        info: { name, source, recording: false, count: 0 },
        channel: channel ?? this.createChannel(name),
        records: [],
        byContext: new WeakMap(),
        listeners: new Set(),
      }
      this.entries.set(name, entry)
    }
    else if (SOURCE_RANK[source] > SOURCE_RANK[entry.info.source]) {
      entry.info.source = source
    }
    if (description && !entry.info.description)
      entry.info.description = description
    void this.publish()
    return entry
  }

  private createChannel(name: string): TracingChannel {
    if (this.module.tracingChannel)
      return this.module.tracingChannel(name)
    return noopTracingChannel(this.module, name)
  }

  private onPhase(entry: ChannelEntry, phase: DevframeTracePhase, message: unknown): void {
    const at = Date.now()
    const keyed = typeof message === 'object' && message !== null
    const record = (keyed ? entry.byContext.get(message) : undefined) ?? this.openRecord(entry, at, keyed ? message : undefined)

    record.events.push({ phase, at })
    record.duration = at - record.startedAt
    const { result, error, ...rest } = keyed ? (message as { result?: unknown, error?: unknown }) : {}
    record.context = serializeTraceValue(keyed ? rest : message)
    if (result !== undefined)
      record.result = serializeTraceValue(result)
    if (phase === 'error') {
      record.status = 'error'
      const serialized = serializeTraceValue(error)
      record.error = isErrorShape(serialized) ? serialized : { name: 'Error', message: String(error) }
    }
    else if ((phase === 'end' || phase === 'asyncEnd') && record.status === 'pending') {
      record.status = 'ok'
    }

    const snapshot = { ...record, events: [...record.events] }
    entry.sink?.write(snapshot)
    for (const fn of entry.listeners)
      fn(snapshot)
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
    this.scheduleCountFlush()
    return record
  }

  /** Counts change on every record; batch them so the state is not spammed. */
  private scheduleCountFlush(): void {
    if (this.countTimer)
      return
    this.countTimer = setTimeout(() => {
      this.countTimer = undefined
      void this.publish()
    }, COUNT_FLUSH_MS)
  }

  private async publish(): Promise<void> {
    const state = await this.state
    state.mutate((value) => {
      for (const entry of this.entries.values())
        value[entry.info.name] = { ...entry.info }
    })
  }

  private registerRpc(): void {
    const rpc = this.context.rpc
    rpc.register({
      name: 'devframe:tracing:record',
      type: 'action',
      handler: async (name: string) => this.record(name),
    })
    rpc.register({
      name: 'devframe:tracing:stop',
      type: 'action',
      handler: async (name: string) => this.stop(name),
    })
    rpc.register({
      name: 'devframe:tracing:clear',
      type: 'action',
      handler: async (name: string) => this.clear(name),
    })
  }
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
