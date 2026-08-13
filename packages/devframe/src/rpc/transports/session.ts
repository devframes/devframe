import type { Peer } from 'crossws'

/**
 * Which wire transport produced an RPC connection. Every transport speaks
 * the same birpc channel protocol; the kind only matters to code that needs
 * transport-specific behavior (e.g. reaching the WS escape hatch on
 * {@link DevframeRpcConnection.peer}).
 */
export type DevframeRpcTransportKind = 'websocket' | 'sse'

/**
 * Structural view of the connect-time HTTP request behind an RPC connection
 * — the WS upgrade request, or the request opening an SSE stream. Shaped to
 * match both the web `Request` a crossws peer exposes and a plain
 * `node:http` request wrapper, so auth hooks can read the bearer-token
 * query param and the `Origin` header without caring which transport (or
 * runtime) produced the connection.
 */
export interface DevframeRpcConnectionRequest {
  /** Request URL (may be path-only, e.g. `/__ws?devframe_auth_token=…`). */
  url?: string
  /** Header lookup, `Headers`-style. */
  headers?: { get: (name: string) => string | null | undefined }
}

/**
 * A live RPC connection, independent of the transport that carries it. One
 * exists per connected client; transport bindings construct it alongside the
 * session meta and hand both to the connect/disconnect hooks
 * (`onPeerConnect` / `onPeerDisconnect`, {@link DevframeAuthHandler.onConnect}).
 */
export interface DevframeRpcConnection {
  /** Session id — the same value as the session meta's `id`. */
  id: number
  /** The transport carrying this connection. */
  transport: DevframeRpcTransportKind
  /** The connect-time HTTP request (upgrade request / stream request). */
  request?: DevframeRpcConnectionRequest
  /** Send a raw wire frame to this client. Prefer the birpc channel. */
  send?: (data: string) => void
  /** Terminate the connection from the server side. */
  close?: (code?: number, reason?: string) => void
  /**
   * The crossws peer backing a `websocket` connection — the WS-specific
   * escape hatch (pub/sub, raw socket access). Absent on other transports.
   */
  peer?: Peer
}

export interface DevframeNodeRpcSessionMeta {
  id: number
  /** The crossws peer backing this session's socket (WS transport only). */
  peer?: Peer
  clientAuthToken?: string
  isTrusted?: boolean
  subscribedStates: Set<string>
  /**
   * Streams this session has subscribed to via
   * `rpc.streaming.subscribe(channel, id)`. Tracked here for O(1) cleanup
   * on disconnect; the wire format is `${channel}\x1F${id}`.
   */
  subscribedStreams?: Set<string>
  /**
   * Inbound streams this session is currently uploading to (via
   * `rpc.streaming.upload(channel, id)`). Tracked for cleanup on
   * disconnect; same wire format as `subscribedStreams`.
   */
  uploadingStreams?: Set<string>
}

let sessionId = 0

/**
 * Mint the per-connection session meta every transport binding shares —
 * one id space across transports, so session bookkeeping (streaming
 * subscriptions, shared-state sync, auth trust) never collides between a
 * WS peer and an SSE session on the same server.
 */
export function createRpcSessionMeta(): DevframeNodeRpcSessionMeta {
  return {
    id: sessionId++,
    subscribedStates: new Set(),
  }
}
