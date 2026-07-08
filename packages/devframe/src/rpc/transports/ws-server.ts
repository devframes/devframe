import type { BirpcGroup, ChannelOptions } from 'birpc'
import type { Peer } from 'crossws'
import type { NodeAdapter } from 'crossws/adapters/node'
import type { Buffer } from 'node:buffer'
import type { Server as HttpServer, IncomingMessage } from 'node:http'
import type { Server as HttpsServer, ServerOptions as HttpsServerOptions } from 'node:https'
import type { Duplex } from 'node:stream'
import type { RpcFunctionDefinitionAny } from '../types'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import crossws from 'crossws/adapters/node'
import { structuredCloneParse, structuredCloneStringify } from 'devframe/utils/structured-clone'
import { strictJsonStringify, STRUCTURED_CLONE_PREFIX } from '../serialization'

export interface DevframeNodeRpcSessionMeta {
  id: number
  /** The crossws peer backing this session's socket. */
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

export interface WsRpcTransportOptions {
  /**
   * Attach to an existing HTTP(S) server, sharing its port. Combine with
   * `path` to bind the WS endpoint to a single route so it coexists with
   * other upgrade handlers on the same server (e.g. a Vite dev server's HMR
   * socket). The shared server's lifecycle is owned by the caller — closing
   * this transport detaches the upgrade listener without closing the server.
   */
  server?: HttpServer | HttpsServer
  /** Port for a newly-created standalone WS server. */
  port?: number
  /** Host for a newly-created standalone WS server. Defaults to `localhost`. */
  host?: string
  /**
   * Restrict the WS endpoint to a single upgrade route (e.g. `/__devframe_ws`). When
   * sharing a `server`, non-matching upgrade requests are left untouched for
   * other listeners to handle, so devframe's socket can sit alongside
   * framework sockets (Vite HMR, etc.).
   */
  path?: string
  /**
   * Destroy upgrade requests that don't match `path` instead of leaving them
   * for other listeners. Enable this when devframe owns the shared server
   * outright (nothing else handles its upgrades), so an off-route client is
   * rejected promptly rather than left hanging. Default: `false`
   * (coexist-friendly); servers this transport creates itself always
   * destroy unmatched upgrades.
   */
  destroyUnmatched?: boolean
  /** When set, a new https.Server is created and the WS endpoint is attached to it. */
  https?: HttpsServerOptions
  /**
   * Extra origins to accept on the WS upgrade beyond the loopback default.
   * Add your LAN/tunnel origin here when reaching the tool from another host.
   * Pass `false` to disable origin checking entirely (not recommended).
   * Default: loopback-only.
   */
  allowedOrigins?: readonly string[] | false
  /**
   * RPC function definitions, used by the per-call wire serializer to
   * dispatch between strict-JSON and structured-clone encoding based
   * on each function's `jsonSerializable` flag.
   *
   * When omitted, all messages fall back to structured-clone — safe but
   * loses dev-time validation for `jsonSerializable: true` declarations.
   */
  definitions?: ReadonlyMap<string, Pick<RpcFunctionDefinitionAny, 'jsonSerializable'>>
  onConnected?: (peer: Peer, meta: DevframeNodeRpcSessionMeta) => void
  onDisconnected?: (peer: Peer, meta: DevframeNodeRpcSessionMeta) => void
  /** Override the default per-call serializer. Most callers should leave this unset. */
  serialize?: ChannelOptions['serialize']
  /** Override the default per-call deserializer. Most callers should leave this unset. */
  deserialize?: ChannelOptions['deserialize']
}

export interface WsRpcTransport {
  /**
   * The crossws node adapter driving the socket — exposes the connected
   * `peers` and pub/sub. See https://crossws.h3.dev.
   */
  ws: NodeAdapter
  /** Remove the upgrade listener from a shared `server` (a no-op otherwise). */
  detach: () => void
  /**
   * Tear the transport down deterministically: detach from a shared server,
   * force-terminate every connected peer, and close any server this
   * transport created itself (`port` / `https` modes).
   */
  close: () => Promise<void>
}

let sessionId = 0

const EMPTY_DEFS: ReadonlyMap<string, Pick<RpcFunctionDefinitionAny, 'jsonSerializable'>> = new Map()

function NOOP() {}

/** Compare two URL paths ignoring a trailing slash. */
function pathMatches(a: string, b: string): boolean {
  const strip = (p: string) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p)
  return strip(a) === strip(b)
}

export function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets
  return h === 'localhost' || h === '127.0.0.1' || h === '::1'
    || h.endsWith('.localhost') || h.startsWith('127.')
}

/**
 * Default origin policy for a localhost dev tool: allow requests with no
 * `Origin` header (native, non-browser clients), allow any loopback origin
 * (so cross-port localhost dev setups keep working), and allow explicitly
 * configured origins. Everything else — a real remote page in the dev's
 * browser — is rejected.
 */
export function isAllowedOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!origin)
    return true
  if (allowedOrigins.includes(origin))
    return true
  try {
    return isLoopbackHostname(new URL(origin).hostname)
  }
  catch {
    return false
  }
}

/**
 * Route `upgrade` events on a server to the crossws adapter, optionally
 * filtered to a single `path`. Non-matching requests are left untouched so
 * other upgrade listeners (e.g. a Vite dev server's HMR socket) can claim
 * them, unless `destroyUnmatched` is set. Returns a detach function that
 * removes the listener.
 */
function routeUpgrades(
  server: HttpServer | HttpsServer,
  ws: NodeAdapter,
  path: string | undefined,
  destroyUnmatched: boolean,
  allowedOrigins: readonly string[] | false | undefined,
): () => void {
  const listener = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on('error', () => {
      // Prevent unhandled ECONNRESET crashes when destroying the socket
      // or when the client abruptly disconnects.
    })

    if (path) {
      let pathname = req.url ?? '/'
      try {
        pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      }
      catch {}
      if (!pathMatches(pathname, path)) {
        if (destroyUnmatched) {
          socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
          socket.destroy()
        }
        return
      }
    }
    if (allowedOrigins !== false && !isAllowedOrigin(req.headers.origin, allowedOrigins ?? [])) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    void ws.handleUpgrade(req, socket, head)
  }
  server.on('upgrade', listener)
  return () => server.off('upgrade', listener)
}

/**
 * Attach a WebSocket transport to an existing RPC group, powered by
 * [crossws](https://crossws.h3.dev). Either attach to an existing HTTP(S)
 * `server` (sharing its port, optionally scoped to a `path`), or let this
 * helper create a standalone server from `port` / `host` / `https`.
 *
 * Returns the crossws node adapter plus `detach` (remove the upgrade
 * listener from a shared `server`) and `close` (full deterministic
 * teardown).
 */
export function attachWsRpcTransport<
  ClientFunctions extends object,
  ServerFunctions extends object,
>(
  rpcGroup: BirpcGroup<ClientFunctions, ServerFunctions, false>,
  options: WsRpcTransportOptions = {},
): WsRpcTransport {
  const {
    server,
    port,
    host = 'localhost',
    path,
    destroyUnmatched = false,
    https,
    allowedOrigins,
    onConnected = NOOP,
    onDisconnected = NOOP,
    definitions = EMPTY_DEFS,
    serialize: serializeOverride,
    deserialize: deserializeOverride,
  } = options

  interface PeerState {
    meta: DevframeNodeRpcSessionMeta
    channel: ChannelOptions
    /** birpc's inbound-message handler, registered via the channel's `on`. */
    onMessage?: (data: string) => void
  }
  const states = new WeakMap<Peer, PeerState>()

  const ws = crossws({
    hooks: {
      open: (peer) => {
        const meta: DevframeNodeRpcSessionMeta = {
          id: sessionId++,
          peer,
          subscribedStates: new Set(),
        }

        // Per-connection state: maps an incoming request id to its method
        // name so the matching outgoing response can look the method back
        // up in `definitions` and pick the right encoder. One map per
        // session — request-id spaces don't collide across sessions.
        const pendingRequestMethods = new Map<string, string>()
        const state: PeerState = { meta, channel: undefined as unknown as ChannelOptions }
        const channel: ChannelOptions = {
          post: (data) => {
            peer.send(data)
          },
          on: (fn) => {
            state.onMessage = fn
          },
          serialize: serializeOverride ?? ((msg: any): string => {
            let method: string | undefined
            if (msg.t === 'q') {
              method = msg.m
            }
            else {
              method = pendingRequestMethods.get(msg.i)
              pendingRequestMethods.delete(msg.i)
            }
            // `jsonSerializable` constrains the return-value path (args + return).
            // Error envelopes (`{ t: 's', i, e }`) carry a thrown value — fall back
            // to structured-clone so they round-trip instead of crashing the serializer.
            // Detect via `'e' in msg` so `throw undefined` still routes through SC.
            const isErrorResponse = msg.t === 's' && 'e' in msg
            const useJson = !isErrorResponse && !!method && definitions.get(method)?.jsonSerializable === true
            if (useJson)
              return strictJsonStringify(msg, method ?? '')
            return `${STRUCTURED_CLONE_PREFIX}${structuredCloneStringify(msg)}`
          }),
          deserialize: deserializeOverride ?? ((raw: string): any => {
            const msg: any = raw.startsWith(STRUCTURED_CLONE_PREFIX)
              ? structuredCloneParse(raw.slice(STRUCTURED_CLONE_PREFIX.length))
              : JSON.parse(raw)
            if (msg.t === 'q' && msg.i && msg.m)
              pendingRequestMethods.set(msg.i, msg.m)
            return msg
          }),
          meta,
        }
        state.channel = channel
        states.set(peer, state)

        rpcGroup.updateChannels((channels) => {
          channels.push(channel)
        })
        onConnected(peer, meta)
      },
      message: (peer, message) => {
        states.get(peer)?.onMessage?.(message.text())
      },
      close: (peer) => {
        const state = states.get(peer)
        if (!state)
          return
        states.delete(peer)
        rpcGroup.updateChannels((channels) => {
          const index = channels.indexOf(state.channel)
          if (index >= 0)
            channels.splice(index, 1)
        })
        onDisconnected(peer, state.meta)
      },
    },
  })

  let detach = NOOP
  // A server created (and thus owned) by this transport. Nothing else
  // handles its upgrades, so off-route clients are rejected promptly.
  let ownedServer: HttpServer | HttpsServer | undefined
  if (server) {
    // Share an existing HTTP(S) server's port. Route upgrades ourselves so we
    // can coexist with the host's own upgrade handlers.
    detach = routeUpgrades(server, ws, path, destroyUnmatched, allowedOrigins)
  }
  else if (https) {
    ownedServer = createHttpsServer(https)
    detach = routeUpgrades(ownedServer, ws, path, true, allowedOrigins)
    ownedServer.listen(port, host)
  }
  else {
    // Standalone server on its own port. Plain HTTP requests get the
    // WebSocket-only signal instead of hanging.
    ownedServer = createHttpServer((_req, res) => {
      res.writeHead(426, { 'content-type': 'text/plain' })
      res.end('Upgrade Required')
    })
    detach = routeUpgrades(ownedServer, ws, path, true, allowedOrigins)
    ownedServer.listen(port, host)
  }

  return {
    ws,
    detach,
    async close() {
      // Detach our upgrade listener first so a shared host server stops
      // routing new connections to us (and other handlers keep working).
      detach()
      // Force-terminate every peer so callers can deterministically tear
      // the server down (tests, hot reload, graceful shutdown) — a graceful
      // close would wait for clients to disconnect on their own.
      ws.closeAll(undefined, undefined, true)
      if (ownedServer) {
        const srv = ownedServer
        await new Promise<void>(r => srv.close(() => r()))
      }
    },
  }
}
