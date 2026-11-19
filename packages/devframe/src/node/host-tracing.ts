import type {
  DevframeNodeContext,
  DevframeTraceRecord,
  DevframeTracingChannelInfo,
  DevframeTracingHost,
  DevframeTracingOptions,
  DevframeTracingSource,
  DevframeTracingSourceEvent,
  RpcStreamingChannel,
} from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { StreamSink } from 'devframe/utils/streaming-channel'
import type { TracingChannel } from 'node:diagnostics_channel'
import type { TracingModule } from './tracing-recorder'
import * as diagnosticsChannel from 'node:diagnostics_channel'
import { DEVFRAME_EVENTS } from '../events'
import { TRACING_RECORD_BUFFER, TracingRecorder } from './tracing-recorder'

export { TRACING_RECORD_BUFFER }

const COUNT_FLUSH_MS = 100

/** Tracing Channels Node.js itself publishes. */
const BUILTIN_CHANNELS: Record<string, string> = {
  'module.require': 'Every CommonJS require() call',
  'net.server.listen': 'net.Server listen() calls',
}

/**
 * `ctx.tracing`: a local {@link TracingRecorder} plus any attached sources,
 * relayed over one shared state and one streaming channel. Devframe only
 * records the local recorder's channels; attached sources record themselves.
 */
export class DevframeTracingHostImpl implements DevframeTracingHost {
  readonly supported: boolean
  private readonly local: TracingRecorder
  private readonly sources: DevframeTracingSource[] = []
  /** Channel name → the source that owns it. Attached sources win over the local one. */
  private owners = new Map<string, DevframeTracingSource>()
  private readonly sinks = new Map<string, StreamSink<DevframeTraceRecord>>()
  private readonly listeners = new Map<string, Set<(record: DevframeTraceRecord) => void>>()
  private readonly stream: RpcStreamingChannel<DevframeTraceRecord>
  private readonly state: Promise<SharedState<Record<string, DevframeTracingChannelInfo>>>
  private countTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly context: DevframeNodeContext,
    module: TracingModule = diagnosticsChannel,
  ) {
    this.local = new TracingRecorder(module)
    this.supported = this.local.supported
    this.stream = context.rpc.streaming.create<DevframeTraceRecord>(DEVFRAME_EVENTS.stream.tracing, {
      replayWindow: TRACING_RECORD_BUFFER,
      closedStreamRetention: 0,
    })
    this.state = context.rpc.sharedState.get<Record<string, DevframeTracingChannelInfo>>(
      DEVFRAME_EVENTS.sharedState.tracingChannels,
      { initialValue: {} },
    )
    for (const [name, description] of Object.entries(BUILTIN_CHANNELS))
      this.local.add(name, 'builtin', description)
    this.local.subscribe(event => this.onSourceEvent(this.local, event))
    this.refresh()
    this.registerRpc()
  }

  _applyOptions(options: DevframeTracingOptions | undefined): void {
    this.local.applyOptions(options)
  }

  register(channel: string | TracingChannel, meta?: { description?: string }): TracingChannel {
    return this.local.register(channel, meta)
  }

  list(): DevframeTracingChannelInfo[] {
    return Array.from(this.collect().infos.values(), info => ({ ...info, streamId: this.sinks.get(info.name)?.id }))
  }

  record(name: string): void {
    const source = this.owners.get(name)
    if (source && source !== this.local)
      source.record?.(name)
    else
      this.local.record(name)
  }

  stop(name: string): void {
    const source = this.owners.get(name)
    if (source && source !== this.local)
      source.stop?.(name)
    else
      this.local.stop(name)
  }

  records(name: string): DevframeTraceRecord[] {
    return (this.owners.get(name) ?? this.local).records(name)
  }

  clear(name: string): void {
    const source = this.owners.get(name)
    if (source && source !== this.local)
      source.clear?.(name)
    else
      this.local.clear(name)
  }

  onRecord(name: string, fn: (record: DevframeTraceRecord) => void): () => void {
    if (!this.owners.has(name))
      this.local.add(name, 'adhoc')
    let set = this.listeners.get(name)
    if (!set)
      this.listeners.set(name, set = new Set())
    set.add(fn)
    return () => {
      set.delete(fn)
    }
  }

  attach(source: DevframeTracingSource): () => void {
    if (source === this.local || this.sources.includes(source))
      return () => {}
    this.sources.push(source)
    const unsubscribe = source.subscribe(event => this.onSourceEvent(source, event))
    this.refresh()
    return () => {
      const index = this.sources.indexOf(source)
      if (index === -1)
        return
      this.sources.splice(index, 1)
      unsubscribe()
      this.refresh()
    }
  }

  private onSourceEvent(source: DevframeTracingSource, event: DevframeTracingSourceEvent): void {
    if (event.type === 'channels') {
      this.refresh()
      return
    }
    if (this.owners.get(event.type === 'record' ? event.record.channel : event.channel) !== source)
      return
    if (event.type === 'clear') {
      // A fresh stream drops the replay buffer, so a client that reconnects
      // after a clear does not see the cleared records again.
      const sink = this.sinks.get(event.channel)
      if (sink) {
        sink.close()
        this.sinks.set(event.channel, this.stream.start())
      }
      this.refresh()
      return
    }
    this.sinks.get(event.record.channel)?.write(event.record)
    for (const fn of this.listeners.get(event.record.channel) ?? [])
      fn(event.record)
    this.scheduleCountFlush()
  }

  /** Every channel with its owner. Attached sources override the local one, later ones win. */
  private collect(): { owners: Map<string, DevframeTracingSource>, infos: Map<string, DevframeTracingChannelInfo> } {
    const owners = new Map<string, DevframeTracingSource>()
    const infos = new Map<string, DevframeTracingChannelInfo>()
    for (const source of [this.local, ...this.sources]) {
      for (const info of source.list()) {
        owners.set(info.name, source)
        infos.set(info.name, info)
      }
    }
    return { owners, infos }
  }

  /** Rebuild ownership, open or close one stream per recording channel, and publish. */
  private refresh(): void {
    const { owners, infos } = this.collect()
    this.owners = owners

    for (const [name, sink] of this.sinks) {
      if (!infos.get(name)?.recording) {
        sink.close()
        this.sinks.delete(name)
      }
    }
    for (const info of infos.values()) {
      if (info.recording && !this.sinks.has(info.name))
        this.sinks.set(info.name, this.stream.start())
    }

    void this.publish(infos)
  }

  /** Counts change on every record; batch them so the state is not spammed. */
  private scheduleCountFlush(): void {
    if (this.countTimer)
      return
    this.countTimer = setTimeout(() => {
      this.countTimer = undefined
      this.refresh()
    }, COUNT_FLUSH_MS)
  }

  private async publish(infos: Map<string, DevframeTracingChannelInfo>): Promise<void> {
    const state = await this.state
    const next: Record<string, DevframeTracingChannelInfo> = {}
    for (const [name, info] of infos)
      next[name] = { ...info, streamId: this.sinks.get(name)?.id }
    state.mutate((value) => {
      for (const name of Object.keys(value)) {
        if (!(name in next))
          delete value[name]
      }
      Object.assign(value, next)
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
