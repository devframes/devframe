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

/**
 * Node-side Tracing Channel host, exposed as `ctx.tracing`. Wraps
 * `node:diagnostics_channel`'s `TracingChannel`: keeps the list of known
 * channels, subscribes on demand, folds lifecycle events into
 * {@link DevframeTraceRecord}s, and advertises both over RPC.
 *
 * On a runtime without `tracingChannel` every method is a no-op;
 * `record()` reports `DF0081` once.
 */
export interface DevframeTracingHost {
  /**
   * Declare a Tracing Channel and get the Node `TracingChannel` back, so a
   * producer can call `tracePromise` / `traceSync` on it. Idempotent: the
   * same name returns the same channel. Accepts an existing instance too.
   */
  register: (channel: string | TracingChannel, meta?: { description?: string }) => TracingChannel
  list: () => DevframeTracingChannelInfo[]
  /** Subscribe to the channel and start folding events into records. */
  record: (name: string) => void
  /** Unsubscribe. Records stay in the buffer. */
  stop: (name: string) => void
  /** Buffered records, oldest first. */
  records: (name: string) => DevframeTraceRecord[]
  clear: (name: string) => void
  /** Called with the whole record on every lifecycle update. */
  onRecord: (name: string, fn: (record: DevframeTraceRecord) => void) => () => void
  /**
   * Adapters call this with a definition's or hub's `tracing` field before
   * `setup()` runs. Wired by the adapters automatically.
   *
   * @internal
   */
  _applyOptions: (options: DevframeTracingOptions | undefined) => void
}
