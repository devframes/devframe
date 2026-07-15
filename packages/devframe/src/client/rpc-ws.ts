import type { ConnectionMeta, DevframeRpcClientFunctions, DevframeRpcServerFunctions, EventEmitter } from 'devframe/types'
import type { DevframeConnectionStatus } from './connection'
import type { DevframeClientRpcHost, DevframeRpcClientMode, DevframeRpcClientOptions, RpcClientEvents } from './rpc'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { promiseWithResolver } from 'devframe/utils/promise'
import { parseUA } from 'ua-parser-modern'
import { withProtocol } from 'ufo'
import { DevframeConnectionError } from './connection'

export interface CreateWsRpcClientModeOptions {
  authToken?: string
  connectionMeta: ConnectionMeta
  /**
   * Absolute URL of where `__connection.json` was loaded from. Relative WS
   * paths in the connection meta are resolved against it so the endpoint
   * lands on the same origin the SPA loaded from (proxy-safe).
   */
  metaBaseUrl?: string
  events: EventEmitter<RpcClientEvents>
  clientRpc: DevframeClientRpcHost
  rpcOptions?: DevframeRpcClientOptions['rpcOptions']
  wsOptions?: DevframeRpcClientOptions['wsOptions']
  /** See {@link DevframeRpcClientOptions.callTimeout}. */
  callTimeout?: number
}

/** Minimal subset of `window.location` needed to resolve a WS URL. */
export interface WsUrlLocation {
  protocol: string
  host: string
  hostname: string
  href: string
}

/**
 * Resolve a {@link ConnectionMeta.websocket} descriptor into a concrete
 * `ws(s)://` URL.
 *
 * The object / relative-path forms connect to the page's own origin (only the
 * `http`→`ws` protocol swap is applied), resolving the path against where
 * `__connection.json` was loaded. This is deliberately host-agnostic so the
 * connection survives a reverse proxy that changes the domain or port — the
 * client trusts its own location, never a server-baked hostname. An explicit
 * `port`/`host` (or a full `ws(s)://` URL string) opts into a cross-origin
 * endpoint, e.g. a side-car server on its own port.
 */
export function resolveWsUrl(
  websocket: ConnectionMeta['websocket'],
  metaBaseUrl: string,
  loc: WsUrlLocation,
): string {
  const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:'
  const base = (() => {
    try {
      return new URL(metaBaseUrl, loc.href)
    }
    catch {
      return new URL(loc.href)
    }
  })()

  // Object form — the proxy-flexible default.
  if (websocket && typeof websocket === 'object') {
    // An explicit host/port marks a cross-origin endpoint (e.g. a side-car on
    // its own port): root the path at that origin, independent of where the
    // meta file sits. Otherwise stay same-origin and resolve the path relative
    // to the meta base so a reverse-proxied subpath is honored.
    if (websocket.host != null || websocket.port != null) {
      const host = websocket.host ?? `${loc.hostname}:${websocket.port}`
      const target = new URL(websocket.path ?? '/', `${wsProtocol}//${host}`)
      target.protocol = wsProtocol
      return target.href
    }
    const target = new URL(websocket.path ?? '', base)
    target.protocol = wsProtocol
    return target.href
  }

  // Legacy numeric port — page hostname, explicit port.
  if (typeof websocket === 'number')
    return `${wsProtocol}//${loc.hostname}:${websocket}`

  const str = websocket ?? ''
  // Full WS URL — used verbatim.
  if (/^wss?:\/\//i.test(str))
    return str
  // HTTP(S) URL — swap to the matching WS protocol.
  if (/^https?:\/\//i.test(str))
    return withProtocol(str, /^https/i.test(str) ? 'wss://' : 'ws://')
  // Path string — resolve same-origin against the meta base.
  const target = new URL(str, base)
  target.protocol = wsProtocol
  return target.href
}

export function createWsRpcClientMode(
  options: CreateWsRpcClientModeOptions,
): DevframeRpcClientMode {
  const {
    authToken,
    connectionMeta,
    metaBaseUrl,
    events,
    clientRpc,
    rpcOptions = {},
    wsOptions = {},
    callTimeout = 0,
  } = options

  let isTrusted = false
  let status: DevframeConnectionStatus = 'connecting'
  let connectionError: Error | null = null
  const trustedPromise = promiseWithResolver<boolean>()
  const url = resolveWsUrl(
    connectionMeta.websocket,
    metaBaseUrl ?? './',
    location,
  )

  // ── connection status ────────────────────────────────────────────────────

  function setStatus(next: DevframeConnectionStatus, error: Error | null = null): void {
    if (error)
      connectionError = error
    else if (next === 'connected')
      connectionError = null
    if (next === status)
      return
    const previous = status
    status = next
    events.emit('connection:status', next, previous)
  }

  // Pending calls we can settle proactively — a socket that closes (or a server
  // that never trusts us) would otherwise leave these promises hanging forever,
  // which is exactly the "spinner that never resolves" this guards against.
  const pending = new Set<{ reject: (error: Error) => void }>()

  function rejectAllPending(error: Error): void {
    for (const entry of [...pending]) entry.reject(error)
  }

  function terminalError(): DevframeConnectionError | null {
    if (status === 'disconnected' || status === 'error')
      return new DevframeConnectionError('connection', '[devframe] Not connected to the devframe server', { cause: connectionError ?? undefined })
    if (status === 'unauthorized')
      return new DevframeConnectionError('auth', '[devframe] Not authorized by the devframe server', { cause: connectionError ?? undefined })
    return null
  }

  /**
   * Wrap an in-flight call promise so it settles on server response, on an
   * optional wall-clock timeout, or when the connection drops — never hangs.
   */
  function guardCall<T>(promise: Promise<T>, method: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const entry = {
        reject(error: Error) {
          if (settled)
            return
          finish()
          events.emit('rpc:error', error, method)
          reject(error)
        },
      }
      function finish(): void {
        settled = true
        pending.delete(entry)
        if (timer)
          clearTimeout(timer)
      }
      pending.add(entry)
      if (callTimeout > 0) {
        timer = setTimeout(() => {
          entry.reject(new DevframeConnectionError('timeout', `[devframe] RPC call "${method}" timed out after ${callTimeout}ms`))
        }, callTimeout)
      }
      promise.then(
        (value) => {
          if (settled)
            return
          finish()
          resolve(value)
        },
        (error: unknown) => {
          if (settled)
            return
          finish()
          const err = error instanceof Error ? error : new Error(String(error))
          events.emit('rpc:error', err, method)
          reject(err)
        },
      )
    })
  }

  // Build a minimal `defs` map from the connection meta so the per-call
  // wire serializer dispatches outgoing requests with the correct
  // encoding (JSON for `jsonSerializable: true` methods; structured-
  // clone for the rest).
  const definitions = new Map<string, { jsonSerializable: true }>()
  for (const name of connectionMeta.jsonSerializableMethods ?? [])
    definitions.set(name, { jsonSerializable: true })

  const serverRpc = createRpcClient<DevframeRpcServerFunctions, DevframeRpcClientFunctions>(
    clientRpc.functions,
    {
      channel: createWsRpcChannel({
        url,
        authToken,
        definitions,
        ...wsOptions,
        onConnected(event) {
          // Socket open — the trust handshake (already queued) settles the
          // status to `connected`/`unauthorized`. Stay `connecting` until then.
          wsOptions.onConnected?.(event)
        },
        onError(error) {
          setStatus('error', error)
          events.emit('connection:error', error)
          rejectAllPending(new DevframeConnectionError('connection', '[devframe] Connection to the devframe server failed', { cause: error }))
          wsOptions.onError?.(error)
        },
        onDisconnected(event) {
          // A clean close after we were connected, or a socket that never
          // opened — either way calls can no longer be served.
          if (status !== 'error')
            setStatus('disconnected')
          rejectAllPending(new DevframeConnectionError('connection', '[devframe] Disconnected from the devframe server', { cause: connectionError ?? undefined }))
          wsOptions.onDisconnected?.(event)
        },
      }),
      rpcOptions,
    },
  )

  // Handle server-initiated auth revocation
  clientRpc.register({
    name: 'devframe:auth:revoked',
    type: 'event',
    handler: () => {
      isTrusted = false
      const authError = new DevframeConnectionError('auth', '[devframe] The devframe server revoked this client\'s trust')
      setStatus('unauthorized', authError)
      events.emit('connection:error', authError)
      rejectAllPending(authError)
      events.emit('rpc:is-trusted:updated', false)
    },
  })

  let currentAuthToken: string | undefined = authToken

  function describeUA(): string {
    const info = parseUA(navigator.userAgent)
    return [
      info.browser.name,
      info.browser.version,
      '|',
      info.os.name,
      info.os.version,
      info.device.type,
    ].filter(i => i).join(' ')
  }

  async function requestTrustWithToken(token: string) {
    currentAuthToken = token

    const result = await serverRpc.$call('anonymous:devframe:auth', {
      authToken: token,
      ua: describeUA(),
      origin: location.origin,
    })

    isTrusted = result.isTrusted
    // Only settle the trust gate on success; on failure the client can still
    // authenticate via `requestTrustWithCode`, so leave `ensureTrusted` waiting.
    if (isTrusted) {
      trustedPromise.resolve(true)
      setStatus('connected')
    }
    else {
      // The server refused this token. On an auth-enforcing host, untrusted
      // calls won't be served — surface it so the UI can prompt for auth
      // rather than spin. The standalone (`auth: false`) server auto-trusts,
      // so it never lands here.
      const authError = new DevframeConnectionError('auth', '[devframe] The devframe server refused this client\'s credentials')
      setStatus('unauthorized', authError)
      events.emit('connection:error', authError)
    }
    events.emit('rpc:is-trusted:updated', isTrusted)
    return result.isTrusted
  }

  async function requestTrustWithCode(code: string): Promise<string | null> {
    const result = await serverRpc.$call('anonymous:devframe:auth:exchange', {
      code,
      ua: describeUA(),
      origin: location.origin,
    })

    const token = result?.authToken ?? null
    if (token) {
      currentAuthToken = token
      isTrusted = true
      trustedPromise.resolve(true)
      setStatus('connected')
      events.emit('rpc:is-trusted:updated', true)
    }
    return token
  }

  async function requestTrust() {
    if (isTrusted)
      return true
    // Always announce on connect. The standalone (`auth: false`) noop handler
    // auto-trusts regardless of token; the host adapter looks the token up and
    // returns `false` for an unauthenticated client (empty/unknown token), which
    // then authenticates via `requestTrustWithCode`. The trust gate stays open
    // until then.
    return requestTrustWithToken(currentAuthToken ?? '')
  }

  async function ensureTrusted(timeout = 60_000): Promise<boolean> {
    if (isTrusted)
      trustedPromise.resolve(true)

    if (timeout <= 0)
      return trustedPromise.promise

    let clear = () => {}
    await Promise.race([
      trustedPromise.promise.then(clear),
      new Promise((resolve, reject) => {
        const id = setTimeout(() => {
          reject(new Error('[devframe] Timeout waiting for rpc to be trusted'))
        }, timeout)
        clear = () => clearTimeout(id)
      }),
    ])

    return isTrusted
  }

  return {
    get isTrusted() {
      return isTrusted
    },
    get status() {
      return status
    },
    get connectionError() {
      return connectionError
    },
    requestTrust,
    requestTrustWithToken,
    requestTrustWithCode,
    ensureTrusted,
    call: (...args: any): any => {
      const method = String(args[0])
      const failFast = terminalError()
      if (failFast) {
        events.emit('rpc:error', failFast, method)
        return Promise.reject(failFast)
      }
      return guardCall(
        serverRpc.$call(
          // @ts-expect-error casting
          ...args,
        ),
        method,
      )
    },
    callEvent: (...args: any): any => {
      // Events are fire-and-forget; when the connection is down there's nothing
      // to send, so surface the failure and drop it instead of queuing forever.
      const failFast = terminalError()
      if (failFast) {
        events.emit('rpc:error', failFast, String(args[0]))
        return
      }
      return serverRpc.$callEvent(
        // @ts-expect-error casting
        ...args,
      )
    },
    callOptional: (...args: any): any => {
      const method = String(args[0])
      const failFast = terminalError()
      if (failFast) {
        events.emit('rpc:error', failFast, method)
        return Promise.reject(failFast)
      }
      return guardCall(
        serverRpc.$callOptional(
          // @ts-expect-error casting
          ...args,
        ),
        method,
      )
    },
  }
}
