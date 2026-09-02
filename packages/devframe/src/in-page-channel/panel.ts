import type { AttachedChannelPort } from './internal'
import type {
  ConnectPanelChannelOptions,
  InPageChannelProtocol,
  InPageChannelStatus,
  PanelChannel,
  PanelChannelEvents,
} from './types'
import { createEventEmitter } from 'devframe/utils/events'
import { nanoid } from 'devframe/utils/nanoid'
import {
  attachChannelPort,
  createLocalFunctionRegistry,
  DEFAULT_CALL_TIMEOUT_MS,
  deserializeResult,
  InPageChannelError,
  resolveHeartbeat,
  serializeArgs,
  warnOnce,
  withCallDeadline,
} from './internal'
import {
  defaultHandshakeTargets,
  IN_PAGE_CHANNEL_TAG,
  IN_PAGE_CHANNEL_VERSION,
  isHandshakeMessage,
  resolveAllowedOrigins,
} from './protocol'
import { createPanelStateHost } from './state'

const DEFAULT_HELLO_INTERVAL_MS = 300
const HELLO_INTERVAL_CAP_MS = 3_000
const DEFAULT_EVENT_BUFFER_LIMIT = 64

/**
 * Connect the panel endpoint of an in-page channel.
 *
 * The panel initiates: it posts a versioned hello to every window a
 * same-tab page script can live in (its ancestor chain and its `opener`),
 * retrying with backoff until one answers with a dedicated port — so boot
 * order never matters, and a reload of either side is just a re-handshake
 * (`WindowProxy` references survive navigations). While `connecting`,
 * outgoing calls and events are buffered; when no page script exists at all
 * (e.g. the panel opened standalone), the endpoint stays `connecting` and
 * the UI can key a fallback state off `status` / `whenConnected()`.
 */
export function connectPanelChannel<P extends InPageChannelProtocol>(
  options: ConnectPanelChannelOptions<P>,
): PanelChannel<P> {
  const { name } = options
  const callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS
  const eventBufferLimit = options.eventBufferLimit ?? DEFAULT_EVENT_BUFFER_LIMIT
  const win = options.window === false
    ? undefined
    : options.window ?? (typeof window === 'undefined' ? undefined : window)
  const allowedOrigins = resolveAllowedOrigins(options.allowedOrigins, win)
  const heartbeat = resolveHeartbeat(options.heartbeat)
  const codec = { serialize: options.serialize, deserialize: options.deserialize }
  const panelId = nanoid()
  const targets = options.targets ?? (win ? defaultHandshakeTargets(win) : [])
  const canHandshake = !!win && targets.length > 0

  const events = createEventEmitter<PanelChannelEvents>()
  const registry = createLocalFunctionRegistry(codec)
  for (const [fnName, definition] of Object.entries(options.functions ?? {}))
    registry.register({ ...definition, name: fnName })

  let status: InPageChannelStatus = 'connecting'
  let attached: AttachedChannelPort | undefined
  let pageScriptInfo: { instanceId: string } | undefined
  let helloTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let droppedEventsWarned = false
  const pendingCalls: { run: () => void, reject: (error: unknown) => void }[] = []
  const eventBuffer: { method: string, args: unknown[] }[] = []
  const connectedWaiters: { resolve: () => void, reject: (error: unknown) => void }[] = []

  function setStatus(next: InPageChannelStatus): void {
    if (status !== next) {
      status = next
      events.emit('status:updated', next)
    }
  }

  const stateHost = createPanelStateHost<P>({
    isConnected: () => status === 'connected',
    callEvent: (method, args) => sendEvent(method, args),
    call: (method, args) => enqueueCall(method, args),
  })

  function sendEventNow(method: string, args: unknown[]): void {
    void attached?.rpc.$callRaw({ method, args, event: true, optional: true }).catch(() => {})
  }

  function sendEvent(method: string, args: unknown[]): void {
    if (status === 'closed')
      return
    if (status === 'connected' && attached) {
      sendEventNow(method, args)
      return
    }
    if (eventBuffer.length >= eventBufferLimit) {
      eventBuffer.shift()
      if (!droppedEventsWarned) {
        droppedEventsWarned = true
        console.warn(`[devframe] in-page channel "${name}": event buffer overflowed while connecting — oldest events are being dropped (limit ${eventBufferLimit})`)
      }
    }
    eventBuffer.push({ method, args })
  }

  function enqueueCall(method: string, args: unknown[]): Promise<unknown> {
    if (status === 'closed') {
      return Promise.reject(new InPageChannelError(
        'closed',
        `in-page channel "${name}": call "${method}" rejected — the channel is closed`,
      ))
    }
    const attempt = new Promise<unknown>((resolve, reject) => {
      const run = (): void => {
        attached!.rpc.$call(method, ...args)
          .then(result => resolve(deserializeResult(codec, result)), reject)
      }
      if (status === 'connected' && attached)
        run()
      else
        pendingCalls.push({ run, reject })
    })
    return withCallDeadline(
      attempt,
      callTimeoutMs,
      () => `in-page channel "${name}": call "${method}" timed out after ${callTimeoutMs}ms (status: ${status}${status === 'connecting' ? ' — is the page script loaded?' : ''})`,
    )
  }

  function adoptPort(port: MessagePort, info?: { instanceId: string }): void {
    // Most recent grant wins — a fresh page script (after a host reload, or
    // another instance the user pinned to) replaces the previous port.
    attached?.dispose({ bye: true, reason: 'the panel adopted a newer port' })
    attached = attachChannelPort(port, {
      resolveLocal: fnName => stateHost.handlers[fnName] ?? registry.resolve(fnName),
      onControl: (kind) => {
        if (kind === 'ping')
          attached?.postControl('pong')
      },
      onPeerClosed: () => handleDisconnect('the page script went away'),
    })
    pageScriptInfo = info
    stopTimers()
    setStatus('connected')
    if (heartbeat) {
      heartbeatTimer = setInterval(() => {
        if (!attached)
          return
        if (Date.now() - attached.lastActivity > heartbeat.timeoutMs)
          handleDisconnect('the page script went silent (heartbeat timeout)')
        else
          attached.postControl('ping')
      }, heartbeat.intervalMs)
    }
    for (const call of pendingCalls.splice(0))
      call.run()
    for (const { method, args } of eventBuffer.splice(0))
      sendEventNow(method, args)
    stateHost.resubscribe()
    for (const waiter of connectedWaiters.splice(0))
      waiter.resolve()
  }

  function stopTimers(): void {
    if (helloTimer) {
      clearTimeout(helloTimer)
      helloTimer = undefined
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = undefined
    }
  }

  function handleDisconnect(reason: string): void {
    if (status === 'closed')
      return
    attached?.dispose({ reason })
    attached = undefined
    pageScriptInfo = undefined
    stopTimers()
    setStatus('connecting')
    if (canHandshake)
      startHelloLoop()
    else
      warnOnce(`in-page channel "${name}": transport lost (${reason}) and the panel has no handshake targets — staying disconnected`)
  }

  function startHelloLoop(): void {
    if (helloTimer || !canHandshake || status !== 'connecting')
      return
    let delay = options.helloIntervalMs ?? DEFAULT_HELLO_INTERVAL_MS
    const tick = (): void => {
      const hello = {
        channel: IN_PAGE_CHANNEL_TAG,
        v: IN_PAGE_CHANNEL_VERSION,
        kind: 'hello' as const,
        name,
        panelId,
        instanceId: options.instanceId,
      }
      for (const target of targets) {
        for (const origin of allowedOrigins) {
          try {
            target.postMessage(hello, origin)
          }
          catch {
            // Unreachable target/origin pair — the loop keeps retrying.
          }
        }
      }
      delay = Math.min(delay * 1.5, HELLO_INTERVAL_CAP_MS)
      helloTimer = setTimeout(tick, delay)
    }
    tick()
  }

  const onWindowMessage = (event: MessageEvent): void => {
    if (status === 'closed')
      return
    const data: unknown = event.data
    if (!isHandshakeMessage(data) || data.kind !== 'grant' || data.name !== name || data.panelId !== panelId)
      return
    if (data.v !== IN_PAGE_CHANNEL_VERSION) {
      warnOnce(`in-page channel "${name}": ignoring a grant with protocol version ${data.v} (this side speaks ${IN_PAGE_CHANNEL_VERSION}) — align the devframe versions of the page script and the panel`)
      return
    }
    if (!allowedOrigins.includes('*') && !allowedOrigins.includes(event.origin)) {
      warnOnce(`in-page channel "${name}": ignoring a grant from disallowed origin "${event.origin}"`)
      return
    }
    if (options.instanceId && data.instanceId !== options.instanceId)
      return
    const port = event.ports?.[0]
    if (port)
      adoptPort(port, { instanceId: data.instanceId! })
  }

  win?.addEventListener('message', onWindowMessage)

  if (options.transport)
    adoptPort(options.transport)
  else if (canHandshake)
    startHelloLoop()
  else
    warnOnce(`in-page channel "${name}": the panel has no handshake targets (not embedded, no opener) and no transport — calls will buffer until a transport appears or the channel is closed`)

  return {
    name,
    get status() {
      return status
    },
    get pageScript() {
      return pageScriptInfo
    },
    events: { on: events.on, once: events.once },
    whenConnected: (timeoutMs?: number) => {
      if (status === 'connected')
        return Promise.resolve()
      if (status === 'closed')
        return Promise.reject(new InPageChannelError('closed', `in-page channel "${name}" is closed`))
      return new Promise<void>((resolve, reject) => {
        const waiter = { resolve, reject }
        connectedWaiters.push(waiter)
        if (timeoutMs !== undefined && timeoutMs > 0) {
          setTimeout(() => {
            const index = connectedWaiters.indexOf(waiter)
            if (index >= 0) {
              connectedWaiters.splice(index, 1)
              reject(new InPageChannelError(
                'timeout',
                `in-page channel "${name}": no page script answered within ${timeoutMs}ms — `
                + `it may not be loaded in this context (render a fallback state)`,
              ))
            }
          }, timeoutMs)
        }
      })
    },
    call: (fnName, ...args) => enqueueCall(fnName, serializeArgs(codec, args)) as Promise<any>,
    callEvent: (fnName, ...args) => sendEvent(fnName, serializeArgs(codec, args)),
    sharedState: stateHost,
    close: () => {
      if (status === 'closed')
        return
      setStatus('closed')
      stopTimers()
      win?.removeEventListener('message', onWindowMessage)
      attached?.dispose({ bye: true, reason: 'the panel closed the channel' })
      attached = undefined
      pageScriptInfo = undefined
      const closedError = new InPageChannelError('closed', `in-page channel "${name}" was closed`)
      for (const call of pendingCalls.splice(0))
        call.reject(closedError)
      eventBuffer.length = 0
      for (const waiter of connectedWaiters.splice(0))
        waiter.reject(closedError)
    },
  }
}
