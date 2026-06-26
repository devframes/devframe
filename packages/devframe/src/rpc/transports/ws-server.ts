import type { BirpcGroup, ChannelOptions } from 'birpc'
import type { Buffer } from 'node:buffer'
import type { Server as HttpServer, IncomingMessage } from 'node:http'
import type { Server as HttpsServer, ServerOptions as HttpsServerOptions } from 'node:https'
import type { Duplex } from 'node:stream'
import type { WebSocket } from 'ws'
import type { RpcFunctionDefinitionAny } from '../types'
import { createServer as createHttpsServer } from 'node:https'
import { structuredCloneParse, structuredCloneStringify } from 'devframe/utils/structured-clone'
import { WebSocketServer } from 'ws'
import { strictJsonStringify, STRUCTURED_CLONE_PREFIX } from '../serialization'

export interface DevframeNodeRpcSessionMeta {
  id: number
  ws?: WebSocket
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
  /** Attach to an existing WebSocketServer. When provided, `port`, `host`, `https`, and `server` are ignored. */
  wss?: WebSocketServer
  /**
   * Attach to an existing HTTP(S) server, sharing its port. Combine with
   * `path` to bind the WS endpoint to a single route so it coexists with
   * other upgrade handlers on the same server (e.g. a Vite dev server's HMR
   * socket). The shared server's lifecycle is owned by the caller — closing
   * this transport detaches the upgrade listener without closing the server.
   */
  server?: HttpServer | HttpsServer
  /** Port for a newly-created WebSocketServer. */
  port?: number
  /** Host for a newly-created WebSocketServer. Defaults to `localhost`. */
  host?: string
  /**
   * Restrict the WS endpoint to a single upgrade route (e.g. `/__devframe_ws`). When
   * sharing a server (`server` / `wss` bound to one, or `https`), non-matching
   * upgrade requests are left untouched for other listeners to handle, so
   * devframe's socket can sit alongside framework sockets (Vite HMR, etc.).
   */
  path?: string
  /**
   * Destroy upgrade requests that don't match `path` instead of leaving them
   * for other listeners. Enable this when devframe owns the server outright
   * (nothing else handles its upgrades), so an off-route client is rejected
   * promptly rather than left hanging. Default: `false` (coexist-friendly).
   */
  destroyUnmatched?: boolean
  /** When set, a new https.Server is created and the WebSocketServer is attached to it. */
  https?: HttpsServerOptions
  /**
   * RPC function definitions, used by the per-call wire serializer to
   * dispatch between strict-JSON and structured-clone encoding based
   * on each function's `jsonSerializable` flag.
   *
   * When omitted, all messages fall back to structured-clone — safe but
   * loses dev-time validation for `jsonSerializable: true` declarations.
   */
  definitions?: ReadonlyMap<string, Pick<RpcFunctionDefinitionAny, 'jsonSerializable'>>
  onConnected?: (ws: WebSocket, req: IncomingMessage, meta: DevframeNodeRpcSessionMeta) => void
  onDisconnected?: (ws: WebSocket, meta: DevframeNodeRpcSessionMeta) => void
  /** Override the default per-call serializer. Most callers should leave this unset. */
  serialize?: ChannelOptions['serialize']
  /** Override the default per-call deserializer. Most callers should leave this unset. */
  deserialize?: ChannelOptions['deserialize']
}

let sessionId = 0

const EMPTY_DEFS: ReadonlyMap<string, Pick<RpcFunctionDefinitionAny, 'jsonSerializable'>> = new Map()

function NOOP() {}

/** Compare two URL paths ignoring a trailing slash. */
function pathMatches(a: string, b: string): boolean {
  const strip = (p: string) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p)
  return strip(a) === strip(b)
}

/**
 * Route `upgrade` events on a shared server to `wss`, optionally filtered to a
 * single `path`. Non-matching requests are left untouched so other upgrade
 * listeners (e.g. a Vite dev server's HMR socket) can claim them. Returns a
 * detach function that removes the listener.
 */
function routeUpgrades(
  server: HttpServer | HttpsServer,
  wss: WebSocketServer,
  path: string | undefined,
  destroyUnmatched: boolean,
): () => void {
  const listener = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (path) {
      let pathname = req.url ?? '/'
      try {
        pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      }
      catch {}
      if (!pathMatches(pathname, path)) {
        if (destroyUnmatched)
          socket.destroy()
        return
      }
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  }
  server.on('upgrade', listener)
  return () => server.off('upgrade', listener)
}

/**
 * Attach a WebSocket transport to an existing RPC group. Either pass an
 * existing `WebSocketServer` via `wss`, attach to an existing HTTP(S) `server`
 * (sharing its port, optionally scoped to a `path`), or let this helper create
 * a standalone server from `port` / `host` / `https`.
 *
 * Returns the `WebSocketServer` plus a `detach` function that removes any
 * upgrade listener registered on a shared `server` (a no-op otherwise).
 */
export function attachWsRpcTransport<
  ClientFunctions extends object,
  ServerFunctions extends object,
>(
  rpcGroup: BirpcGroup<ClientFunctions, ServerFunctions, false>,
  options: WsRpcTransportOptions = {},
): { wss: WebSocketServer, detach: () => void } {
  const {
    wss: externalWss,
    server,
    port,
    host = 'localhost',
    path,
    destroyUnmatched = false,
    https,
    onConnected = NOOP,
    onDisconnected = NOOP,
    definitions = EMPTY_DEFS,
    serialize: serializeOverride,
    deserialize: deserializeOverride,
  } = options

  let wss: WebSocketServer
  let detach = NOOP
  if (externalWss) {
    wss = externalWss
  }
  else if (server) {
    // Share an existing HTTP(S) server's port. Route upgrades ourselves so we
    // can coexist with the host's own upgrade handlers.
    wss = new WebSocketServer({ noServer: true })
    detach = routeUpgrades(server, wss, path, destroyUnmatched)
  }
  else if (https) {
    const httpsServer = createHttpsServer(https)
    if (path) {
      wss = new WebSocketServer({ noServer: true })
      detach = routeUpgrades(httpsServer, wss, path, destroyUnmatched)
    }
    else {
      wss = new WebSocketServer({ server: httpsServer })
    }
    httpsServer.listen(port, host)
  }
  else {
    // Standalone server on its own port — `ws` enforces `path` itself since
    // nothing else shares this port.
    wss = new WebSocketServer(path ? { port, host, path } : { port, host })
  }

  wss.on('connection', (ws, req) => {
    const meta: DevframeNodeRpcSessionMeta = {
      id: sessionId++,
      ws,
      subscribedStates: new Set(),
    }

    // Per-connection state: maps an incoming request id to its method
    // name so the matching outgoing response can look the method back
    // up in `definitions` and pick the right encoder. One map per WS
    // session — request-id spaces don't collide across sessions.
    const pendingRequestMethods = new Map<string, string>()
    const channel: ChannelOptions = {
      post: (data) => {
        ws.send(data)
      },
      on: (fn) => {
        ws.on('message', (data) => {
          fn(data.toString())
        })
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

    rpcGroup.updateChannels((channels) => {
      channels.push(channel)
    })

    ws.on('close', () => {
      rpcGroup.updateChannels((channels) => {
        const index = channels.indexOf(channel)
        if (index >= 0)
          channels.splice(index, 1)
      })
      onDisconnected(ws, meta)
    })
    onConnected(ws, req, meta)
  })

  return { wss, detach }
}
