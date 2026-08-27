import type { BirpcReturn } from 'birpc'
import type { InPageChannelControlFrame } from './protocol'
import { createBirpc } from 'birpc'
import { InPageChannelError } from './errors'
import { isControlFrame } from './protocol'

/** Loose remote/local function maps — real typing lives on the endpoints. */
type RemoteFunctions = Record<string, (...args: any[]) => any>

export interface AttachChannelPortOptions {
  /** Resolve a locally-registered handler by name (internal + user functions). */
  resolveLocal: (name: string) => ((...args: unknown[]) => unknown) | undefined
  /** A liveness control frame arrived (`bye` is routed to `onPeerClosed` instead). */
  onControl: (kind: 'ping' | 'pong') => void
  /** The peer went away: graceful `bye`, or the port's `close` event fired. */
  onPeerClosed: () => void
}

/**
 * One live `MessagePort` wired into birpc, with the in-page channel's
 * control frames (ping/pong/bye) filtered off the stream before birpc sees
 * it. Both endpoints attach every port through this seam — a future
 * transport only has to produce something port-shaped.
 */
export interface AttachedChannelPort {
  rpc: BirpcReturn<RemoteFunctions, Record<string, never>, false>
  /** Epoch ms of the last frame received — liveness input for heartbeats. */
  lastActivity: number
  postControl: (kind: InPageChannelControlFrame['__dfIpc']) => void
  /** Detach: optionally send `bye`, reject pending calls, close the port. */
  dispose: (options?: { bye?: boolean, reason?: string }) => void
}

function wrapPostError(error: unknown): unknown {
  if (error instanceof DOMException && error.name === 'DataCloneError') {
    return new InPageChannelError(
      'not-cloneable',
      `a payload could not be structured-cloned across the in-page channel: ${error.message}. `
      + `Strip non-cloneable values (functions, DOM nodes, framework reactivity proxies) before sending — `
      + `declare the function \`jsonSerializable: true\` for a precise error, or provide a \`serialize\` hook.`,
      { cause: error },
    )
  }
  return error
}

export function attachChannelPort(port: MessagePort, options: AttachChannelPortOptions): AttachedChannelPort {
  let birpcHandler: ((data: unknown) => void) | undefined
  let disposed = false

  const attached: AttachedChannelPort = {
    rpc: undefined as unknown as AttachedChannelPort['rpc'],
    lastActivity: Date.now(),
    postControl(kind) {
      try {
        port.postMessage({ __dfIpc: kind } satisfies InPageChannelControlFrame)
      }
      catch {
        // A dead or detached port — the close/heartbeat paths handle it.
      }
    },
    dispose(disposeOptions) {
      if (disposed)
        return
      disposed = true
      if (disposeOptions?.bye)
        attached.postControl('bye')
      const reason = disposeOptions?.reason ?? 'the in-page channel port was closed'
      const error = new InPageChannelError('closed', `in-page channel call dropped: ${reason}`)
      attached.rpc.$rejectPendingCalls(({ reject }) => reject(error))
      attached.rpc.$close()
      port.removeEventListener('message', onMessage)
      port.removeEventListener('close', onClose)
      try {
        port.close()
      }
      catch {
        // Already closed.
      }
    },
  }

  function onMessage(event: MessageEvent): void {
    attached.lastActivity = Date.now()
    const data: unknown = event.data
    if (isControlFrame(data)) {
      if (data.__dfIpc === 'bye')
        options.onPeerClosed()
      else
        options.onControl(data.__dfIpc)
      return
    }
    birpcHandler?.(data)
  }
  function onClose(): void {
    options.onPeerClosed()
  }

  attached.rpc = createBirpc<RemoteFunctions, Record<string, never>, false>({}, {
    post: (data) => {
      try {
        port.postMessage(data)
      }
      catch (error) {
        throw wrapPostError(error)
      }
    },
    on: (fn) => {
      birpcHandler = fn as (data: unknown) => void
    },
    off: () => {
      birpcHandler = undefined
    },
    // Deadlines are enforced at the endpoint layer (`withCallDeadline`) with
    // status-aware errors; birpc's own timer stays off.
    timeout: -1,
    proxify: false,
    resolver: (name, resolved) => (resolved as ((...args: unknown[]) => unknown) | undefined) ?? options.resolveLocal(name),
  })

  port.addEventListener('message', onMessage)
  // Instant peer-death detection where the port supports the `close` event
  // (modern browsers, Node); the heartbeat is the fallback elsewhere.
  port.addEventListener('close', onClose)
  port.start?.()

  return attached
}

/**
 * Race a call against its deadline, rejecting with a status-aware
 * `InPageChannelError` (code `timeout`). `ms <= 0` disables the deadline.
 */
export function withCallDeadline<T>(promise: Promise<T>, ms: number, describeTimeout: () => string): Promise<T> {
  if (ms <= 0)
    return promise
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new InPageChannelError('timeout', describeTimeout()))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
