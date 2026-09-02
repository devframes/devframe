import type { SseRpcChannelOptions } from 'devframe/rpc/transports/sse-client'
import type { ConnectionMeta, EventEmitter } from 'devframe/types'
import type { DevframeClientRpcHost, DevframeRpcClientMode, DevframeRpcClientOptions, RpcClientEvents } from './rpc'
import type { WsUrlLocation } from './rpc-ws'
import { createSseRpcChannel } from 'devframe/rpc/transports/sse-client'
import { createLiveRpcClientMode } from './rpc-live'

export interface CreateSseRpcClientModeOptions {
  authToken?: string
  connectionMeta: ConnectionMeta
  /**
   * Absolute URL of where `__connection.json` was loaded from. Relative SSE
   * paths in the connection meta are resolved against it so the endpoint
   * lands on the same origin the SPA loaded from (proxy-safe).
   */
  metaBaseUrl?: string
  events: EventEmitter<RpcClientEvents>
  clientRpc: DevframeClientRpcHost
  rpcOptions?: DevframeRpcClientOptions['rpcOptions']
  sseOptions?: DevframeRpcClientOptions['sseOptions']
  /** See {@link DevframeRpcClientOptions.callTimeout}. */
  callTimeout?: number
}

/**
 * Resolve a {@link ConnectionMeta.sse} descriptor into a concrete
 * `http(s)://` URL, with the same proxy-safe rules as `resolveWsUrl`: the
 * object / relative-path forms resolve against where `__connection.json`
 * was loaded (the client trusts its own location, never a server-baked
 * hostname), while an explicit `port`/`host` (or a full `http(s)://` URL
 * string) opts into a cross-origin endpoint.
 */
export function resolveSseUrl(
  sse: ConnectionMeta['sse'],
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

  // Object form - the proxy-flexible default.
  if (sse && typeof sse === 'object') {
    if (sse.host != null || sse.port != null) {
      const host = sse.host ?? `${base.hostname}:${sse.port}`
      return new URL(sse.path ?? '/', `${base.protocol}//${host}`).href
    }
    return new URL(sse.path ?? '', base).href
  }

  const str = sse ?? ''
  // Full HTTP(S) URL - used verbatim.
  if (/^https?:\/\//i.test(str))
    return str
  // Path string - resolve same-origin against the meta base.
  return new URL(str, base).href
}

/**
 * The SSE-backed live client mode - picked by `connectDevframe` when the
 * server advertises SSE as its primary transport (`backend: 'sse'`) or when
 * the caller pins `transport: 'sse'`. Same status machine, call guarding,
 * and trust handshake as the WebSocket mode, over `createSseRpcChannel`.
 */
export function createSseRpcClientMode(
  options: CreateSseRpcClientModeOptions,
): DevframeRpcClientMode {
  const {
    authToken,
    connectionMeta,
    metaBaseUrl,
    events,
    clientRpc,
    rpcOptions = {},
    sseOptions = {},
    callTimeout = 0,
  } = options

  const url = resolveSseUrl(
    connectionMeta.sse,
    metaBaseUrl ?? './',
    location,
  )

  return createLiveRpcClientMode({
    transport: 'sse',
    authToken,
    connectionMeta,
    events,
    clientRpc,
    rpcOptions,
    callTimeout,
    createChannel: handlers => createSseRpcChannel({
      url,
      authToken,
      definitions: handlers.definitions,
      ...sseOptions,
      onConnected() {
        // Stream open - the trust handshake (already queued) settles the
        // status to `connected`/`unauthorized`. Stay `connecting` until then.
        sseOptions.onConnected?.()
      },
      onError(error) {
        handlers.onError(error)
        sseOptions.onError?.(error)
      },
      onDisconnected() {
        handlers.onDisconnected()
        sseOptions.onDisconnected?.()
      },
    } satisfies SseRpcChannelOptions),
  })
}
