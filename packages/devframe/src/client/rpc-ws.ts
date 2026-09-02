import type { ConnectionMeta, EventEmitter } from 'devframe/types'
import type { DevframeClientRpcHost, DevframeRpcClientMode, DevframeRpcClientOptions, RpcClientEvents } from './rpc'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { withProtocol } from 'ufo'
import { createLiveRpcClientMode } from './rpc-live'

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
 * connection survives a reverse proxy that changes the domain or port - the
 * client trusts its own location, never a server-baked hostname. An explicit
 * `port`/`host` (or a full `ws(s)://` URL string) opts into a cross-origin
 * endpoint, e.g. a side-car server on its own port.
 */
export function resolveWsUrl(
  websocket: ConnectionMeta['websocket'],
  metaBaseUrl: string,
  loc: WsUrlLocation,
): string {
  const base = (() => {
    try {
      return new URL(metaBaseUrl, loc.href)
    }
    catch {
      return new URL(loc.href)
    }
  })()
  const wsProtocol = base.protocol === 'https:' ? 'wss:' : 'ws:'

  // Object form - the proxy-flexible default.
  if (websocket && typeof websocket === 'object') {
    // An explicit host/port marks a cross-origin endpoint (e.g. a side-car on
    // its own port): root the path at that origin, independent of where the
    // meta file sits. Otherwise stay same-origin and resolve the path relative
    // to the meta base so a reverse-proxied subpath is honored.
    if (websocket.host != null || websocket.port != null) {
      const host = websocket.host ?? `${base.hostname}:${websocket.port}`
      const target = new URL(websocket.path ?? '/', `${wsProtocol}//${host}`)
      target.protocol = wsProtocol
      return target.href
    }
    const target = new URL(websocket.path ?? '', base)
    target.protocol = wsProtocol
    return target.href
  }

  // Legacy numeric port - metadata hostname, explicit port. External viewers
  // (such as browser extensions) have their own unrelated location hostname.
  if (typeof websocket === 'number')
    return `${wsProtocol}//${base.hostname}:${websocket}`

  const str = websocket ?? ''
  // Full WS URL - used verbatim.
  if (/^wss?:\/\//i.test(str))
    return str
  // HTTP(S) URL - swap to the matching WS protocol.
  if (/^https?:\/\//i.test(str))
    return withProtocol(str, /^https/i.test(str) ? 'wss://' : 'ws://')
  // Path string - resolve same-origin against the meta base.
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

  const url = resolveWsUrl(
    connectionMeta.websocket,
    metaBaseUrl ?? './',
    location,
  )

  return createLiveRpcClientMode({
    transport: 'websocket',
    authToken,
    connectionMeta,
    events,
    clientRpc,
    rpcOptions,
    callTimeout,
    createChannel: handlers => createWsRpcChannel({
      url,
      authToken,
      definitions: handlers.definitions,
      ...wsOptions,
      onConnected(event) {
        // Socket open - the trust handshake (already queued) settles the
        // status to `connected`/`unauthorized`. Stay `connecting` until then.
        wsOptions.onConnected?.(event)
      },
      onError(error) {
        handlers.onError(error)
        wsOptions.onError?.(error)
      },
      onDisconnected(event) {
        handlers.onDisconnected()
        wsOptions.onDisconnected?.(event)
      },
    }),
  })
}
