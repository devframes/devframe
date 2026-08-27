import type { AttachedChannelPort } from './port'
import type { InPageChannelGrant } from './protocol'
import type {
  CreatePageScriptChannelOptions,
  InPageChannelProtocol,
  PageScriptChannel,
  PageScriptChannelEvents,
  PanelPeer,
} from './types'
import { createEventEmitter } from 'devframe/utils/events'
import { nanoid } from 'devframe/utils/nanoid'
import { warnOnce } from './errors'
import { attachChannelPort, withCallDeadline } from './port'
import {
  IN_PAGE_CHANNEL_TAG,
  IN_PAGE_CHANNEL_VERSION,
  isHandshakeMessage,
  resolveAllowedOrigins,
  resolveInstanceId,
} from './protocol'
import { createLocalFunctionRegistry } from './registry'
import { createPageScriptStateHost } from './state'

const DEFAULT_CALL_TIMEOUT_MS = 15_000
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 12_000

interface PeerInternal<P extends InPageChannelProtocol> {
  id: string
  attached: AttachedChannelPort
  subscribedStates: Set<string>
  internalHandlers: Record<string, (...args: any[]) => unknown>
  peer: PanelPeer<P>
}

/**
 * Create the page-script endpoint of an in-page channel.
 *
 * It listens for panel hellos on the host page's window, answers each with
 * a dedicated `MessageChannel` port (same-origin enforced both ways), and
 * keeps one live peer per panel — dock iframe, popup, and Document-PiP
 * panels all handshake the same way, and a panel reload is simply a new
 * handshake. No server is involved at any point.
 */
export function createPageScriptChannel<P extends InPageChannelProtocol>(
  options: CreatePageScriptChannelOptions,
): PageScriptChannel<P> {
  const { name } = options
  const callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS
  const win = options.window === false
    ? undefined
    : options.window ?? (typeof window === 'undefined' ? undefined : window)
  const allowedOrigins = resolveAllowedOrigins(options.allowedOrigins, win)
  const instanceId = resolveInstanceId(win)
  const heartbeat = options.heartbeat === false
    ? undefined
    : {
        intervalMs: options.heartbeat?.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
        timeoutMs: options.heartbeat?.timeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS,
      }
  const serialization = { serialize: options.serialize, deserialize: options.deserialize }

  const events = createEventEmitter<PageScriptChannelEvents<P>>()
  const peers = new Map<string, PeerInternal<P>>()
  let closed = false
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined

  // Lazily dereferenced: `setup(context)` only runs once the channel exists.
  let channelRef: PageScriptChannel<P>
  const registry = createLocalFunctionRegistry(() => channelRef, serialization)
  const stateHost = createPageScriptStateHost<P>(() => statePeers())

  function* statePeers() {
    for (const peer of peers.values()) {
      yield {
        subscribedStates: peer.subscribedStates,
        callEventRaw: (method: string, args: unknown[]) => {
          void peer.attached.rpc.$callRaw({ method, args, event: true, optional: true }).catch(() => {})
        },
      }
    }
  }

  function serializeArgs(args: unknown[]): unknown[] {
    return serialization.serialize ? args.map(serialization.serialize) : args
  }
  function deserializeResult(result: unknown): unknown {
    return serialization.deserialize && result !== undefined ? serialization.deserialize(result) : result
  }

  function removePeer(id: string, disposeOptions?: { bye?: boolean, reason?: string }): void {
    const peer = peers.get(id)
    if (!peer)
      return
    peers.delete(id)
    peer.attached.dispose(disposeOptions)
    if (peers.size === 0)
      stopHeartbeat()
    events.emit('panel:disconnected', peer.peer)
  }

  function addPeer(port: MessagePort, id: string): PanelPeer<P> {
    // A repeated hello from the same panel (a retry that raced the first
    // grant) replaces the previous port.
    removePeer(id, { reason: 'the panel re-connected' })

    const internal: PeerInternal<P> = {
      id,
      subscribedStates: new Set(),
      internalHandlers: {},
      attached: undefined as unknown as AttachedChannelPort,
      peer: undefined as unknown as PanelPeer<P>,
    }
    internal.internalHandlers = stateHost.createPeerHandlers({
      subscribedStates: internal.subscribedStates,
      callEventRaw: (method, args) => {
        void internal.attached.rpc.$callRaw({ method, args, event: true, optional: true }).catch(() => {})
      },
    })
    internal.attached = attachChannelPort(port, {
      resolveLocal: fnName => internal.internalHandlers[fnName] ?? registry.resolve(fnName),
      onControl: (kind) => {
        if (kind === 'ping')
          internal.attached.postControl('pong')
      },
      onPeerClosed: () => removePeer(id, { reason: 'the panel disconnected' }),
    })
    internal.peer = {
      id,
      call: (fnName, ...args) => withCallDeadline(
        internal.attached.rpc.$call(fnName, ...serializeArgs(args)).then(deserializeResult) as Promise<any>,
        callTimeoutMs,
        () => `in-page channel "${name}": call "${fnName}" to panel "${id}" timed out after ${callTimeoutMs}ms`,
      ),
      callEvent: (fnName, ...args) => {
        void internal.attached.rpc.$callRaw({
          method: fnName,
          args: serializeArgs(args),
          event: true,
          optional: true,
        }).catch(() => {})
      },
      close: () => removePeer(id, { bye: true, reason: 'the page script closed this panel' }),
    }
    peers.set(id, internal)
    startHeartbeat()
    events.emit('panel:connected', internal.peer)
    return internal.peer
  }

  function startHeartbeat(): void {
    if (!heartbeat || heartbeatTimer)
      return
    heartbeatTimer = setInterval(() => {
      const now = Date.now()
      for (const peer of [...peers.values()]) {
        if (now - peer.attached.lastActivity > heartbeat.timeoutMs)
          removePeer(peer.id, { reason: 'the panel went silent (heartbeat timeout)' })
      }
    }, heartbeat.intervalMs)
  }
  function stopHeartbeat(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = undefined
    }
  }

  const onWindowMessage = (event: MessageEvent): void => {
    if (closed)
      return
    const data: unknown = event.data
    if (!isHandshakeMessage(data) || data.kind !== 'hello' || data.name !== name)
      return
    if (data.v !== IN_PAGE_CHANNEL_VERSION) {
      warnOnce(`in-page channel "${name}": ignoring a hello with protocol version ${data.v} (this side speaks ${IN_PAGE_CHANNEL_VERSION}) — align the devframe versions of the page script and the panel`)
      return
    }
    if (!allowedOrigins.includes('*') && !allowedOrigins.includes(event.origin)) {
      warnOnce(`in-page channel "${name}": ignoring a hello from disallowed origin "${event.origin}"`)
      return
    }
    if (data.instanceId && data.instanceId !== instanceId)
      return
    const source = event.source as Window | null
    if (!source || typeof source.postMessage !== 'function')
      return

    const messageChannel = new MessageChannel()
    addPeer(messageChannel.port1, data.panelId)
    const grant: InPageChannelGrant = {
      channel: IN_PAGE_CHANNEL_TAG,
      v: IN_PAGE_CHANNEL_VERSION,
      kind: 'grant',
      name,
      panelId: data.panelId,
      instanceId,
    }
    try {
      source.postMessage(grant, allowedOrigins.includes('*') ? '*' : event.origin, [messageChannel.port2])
    }
    catch (error) {
      console.warn(`[devframe] in-page channel "${name}": failed to grant a port`, error)
      removePeer(data.panelId, { reason: 'the grant could not be delivered' })
    }
  }

  win?.addEventListener('message', onWindowMessage)

  const channel: PageScriptChannel<P> = {
    name,
    instanceId,
    get panels() {
      return [...peers.values()].map(peer => peer.peer)
    },
    events: { on: events.on, once: events.once },
    register: definition => registry.register(definition),
    callEvent: (fnName, ...args) => {
      const wireArgs = serializeArgs(args)
      for (const peer of peers.values()) {
        void peer.attached.rpc.$callRaw({
          method: fnName,
          args: wireArgs,
          event: true,
          optional: true,
        }).catch(() => {})
      }
    },
    sharedState: stateHost,
    addPanelPort: port => addPeer(port, `transport:${nanoid(8)}`),
    close: () => {
      if (closed)
        return
      closed = true
      win?.removeEventListener('message', onWindowMessage)
      for (const id of [...peers.keys()])
        removePeer(id, { bye: true, reason: 'the page script closed the channel' })
      stopHeartbeat()
    },
  }

  channelRef = channel
  for (const definition of options.functions ?? [])
    registry.register(definition)
  const transports = options.transport === undefined
    ? []
    : Array.isArray(options.transport) ? options.transport : [options.transport]
  for (const port of transports)
    channel.addPanelPort(port)

  return channel
}
