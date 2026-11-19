import type { TracingChannel } from 'node:diagnostics_channel'

/**
 * JSON-shaped value produced by the trace serializer. Trace payloads are
 * arbitrary runtime objects (sockets, requests, errors); the serializer
 * flattens them into this shape so they cross the wire and render in a UI.
 */
export type SerializedValue
  = | string
    | number
    | boolean
    | null
    | SerializedValue[]
    | { [key: string]: SerializedValue }

/**
 * Where a Tracing Channel name came from:
 *
 *   - `builtin`: a channel Node.js itself publishes (`module.require`, …).
 *   - `registered`: declared in code through `ctx.tracing.register()`.
 *   - `config`: listed in `tracing.channels` on a definition or hub options.
 *   - `adhoc`: first seen through `record(name)`, typically typed into a UI.
 */
export type DevframeTracingChannelSource = 'builtin' | 'registered' | 'config' | 'adhoc'

/** One known Tracing Channel as advertised to clients. */
export interface DevframeTracingChannelInfo {
  /** Base name, the argument to `tracingChannel(name)`. */
  name: string
  description?: string
  source: DevframeTracingChannelSource
  /** `true` while devframe is subscribed to the Node channel. */
  recording: boolean
  /**
   * Id of the live stream on the `devframe:tracing` streaming channel that
   * carries this channel's records. Set while recording; a fresh id is
   * issued on every `record()` and `clear()`, so a client re-subscribes
   * when it changes.
   */
  streamId?: string
  /** Records currently held in the ring buffer. */
  count: number
}

/** The five lifecycle events a `TracingChannel` publishes. */
export type DevframeTracePhase = 'start' | 'end' | 'asyncStart' | 'asyncEnd' | 'error'

export interface DevframeTraceEvent {
  phase: DevframeTracePhase
  /** `Date.now()` when the event was published. */
  at: number
}

/**
 * One traced unit of work: every lifecycle event that shared the same
 * context object, folded into a single record.
 */
export interface DevframeTraceRecord {
  id: string
  /** Tracing Channel base name. */
  channel: string
  startedAt: number
  /** Milliseconds from `start` to the latest event seen. */
  duration?: number
  /** `pending` until `end`/`asyncEnd` (`ok`) or `error` arrives. */
  status: 'pending' | 'ok' | 'error'
  context: SerializedValue
  result?: SerializedValue
  error?: { name: string, message: string, stack?: string }
  events: DevframeTraceEvent[]
}

export interface DevframeTracingChannelInput {
  name: string
  description?: string
}

/** `tracing` field on a definition or on hub options. */
export interface DevframeTracingOptions {
  /** Tracing Channel names the user app publishes, listed for the UI. */
  channels?: Array<string | DevframeTracingChannelInput>
}

/** What a {@link DevframeTracingSource} tells its listeners. */
export type DevframeTracingSourceEvent
  = | { type: 'record', record: DevframeTraceRecord }
    | { type: 'channels' }
    | { type: 'clear', channel: string }

/**
 * Anything that owns Tracing Channels and their records, outside of
 * `ctx.tracing`. A tool that keeps its own tracing instance attaches it with
 * `ctx.tracing.attach(source)`: devframe then shows the source's channels and
 * relays its records, but never subscribes to them itself. The source records.
 *
 * `createTracingRecorder()` from `devframe/node` returns one. Any object with
 * this shape works too, so a tool does not need devframe at runtime.
 */
export interface DevframeTracingSource {
  /** Channels this source owns. `streamId` is ignored; devframe sets it. */
  list: () => DevframeTracingChannelInfo[]
  /** Buffered records of one channel, oldest first. */
  records: (name: string) => DevframeTraceRecord[]
  /**
   * Push updates. Emit `record` on every record change, `channels` when the
   * channel list or a channel's `recording` / `description` changes, and
   * `clear` when a channel's buffer is dropped.
   */
  subscribe: (listener: (event: DevframeTracingSourceEvent) => void) => () => void
  /** Called when a client asks devframe to record. Omit to keep control in the tool. */
  record?: (name: string) => void
  /** Called when a client asks devframe to stop. */
  stop?: (name: string) => void
  /** Called when a client asks devframe to clear. */
  clear?: (name: string) => void
}

/**
 * A standalone Tracing Channel recorder, made with `createTracingRecorder()`.
 * It has the same recording methods as `ctx.tracing`, without the wire, and
 * is a {@link DevframeTracingSource} that `ctx.tracing.attach()` accepts.
 */
export interface DevframeTracingRecorder extends Required<DevframeTracingSource> {
  /** `false` where the runtime has no `tracingChannel`; every method is a no-op. */
  readonly supported: boolean
  /** Declare a Tracing Channel and get Node's `TracingChannel` back. */
  register: (channel: string | TracingChannel, meta?: { description?: string }) => TracingChannel
  /** Subscribe to the channel and start folding events into records. */
  record: (name: string) => void
  /** Called with the whole record on every lifecycle update. */
  onRecord: (name: string, fn: (record: DevframeTraceRecord) => void) => () => void
}

/**
 * Node-side Tracing Channel host, exposed as `ctx.tracing`. Wraps
 * `node:diagnostics_channel`'s `TracingChannel`: keeps the list of known
 * channels, subscribes on demand, folds lifecycle events into
 * {@link DevframeTraceRecord}s, and advertises both over RPC.
 *
 * On a runtime without `tracingChannel` every method is a no-op;
 * `record()` reports `DF0086` once.
 */
export interface DevframeTracingHost {
  /**
   * Declare a Tracing Channel and get the Node `TracingChannel` back, so a
   * producer can call `tracePromise` / `traceSync` on it. Idempotent: the
   * same name returns the same channel. Accepts an existing instance too.
   */
  register: (channel: string | TracingChannel, meta?: { description?: string }) => TracingChannel
  list: () => DevframeTracingChannelInfo[]
  /**
   * Subscribe to the channel and start folding events into records. For a
   * channel of an attached source, this calls the source's `record()`, or
   * does nothing when the source has none.
   */
  record: (name: string) => void
  /** Unsubscribe. Records stay in the buffer. */
  stop: (name: string) => void
  /** Buffered records, oldest first. */
  records: (name: string) => DevframeTraceRecord[]
  clear: (name: string) => void
  /** Called with the whole record on every lifecycle update. */
  onRecord: (name: string, fn: (record: DevframeTraceRecord) => void) => () => void
  /**
   * Show the channels and records of a tool's own tracing instance. Devframe
   * relays them over the wire but does not record them; the source does.
   * When two sources own the same name, the one attached last wins.
   * Returns a function that detaches the source.
   */
  attach: (source: DevframeTracingSource) => () => void
  /**
   * Adapters call this with a definition's or hub's `tracing` field before
   * `setup()` runs. Wired by the adapters automatically.
   *
   * @internal
   */
  _applyOptions: (options: DevframeTracingOptions | undefined) => void
}
