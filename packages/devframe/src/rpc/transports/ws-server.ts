import type { BirpcGroup, ChannelOptions } from 'birpc'
import type { Hooks, Peer } from 'crossws'
import type { NodeAdapter } from 'crossws/adapters/node'
import type { Buffer } from 'node:buffer'
import type { Server as HttpServer, IncomingMessage } from 'node:http'
import type { Server as HttpsServer, ServerOptions as HttpsServerOptions } from 'node:https'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import type { RpcFunctionDefinitionAny } from '../types'
import type { DevframeNodeRpcSessionMeta, DevframeRpcConnection } from './session'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import crossws from 'crossws/adapters/node'
import { DEVFRAME_VIEWER_ORIGIN_QUERY_PARAM, DEVFRAME_VIEWER_ORIGIN_TOKEN_QUERY_PARAM } from 'devframe/constants'
import { randomToken, timingSafeEqual } from 'devframe/utils/crypto-token'
import { createRpcWireCodec } from '../wire-codec'
import { createRpcSessionMeta } from './session'

export type {
  DevframeNodeRpcSessionMeta,
  DevframeRpcConnection,
  DevframeRpcConnectionRequest,
  DevframeRpcTransportKind,
} from './session'

export interface WsRpcTransportOptions {
  /**
   * Attach to an existing HTTP(S) server, sharing its port. Combine with
   * `path` to bind the WS endpoint to a single route so it coexists with
   * other upgrade handlers on the same server (e.g. a Vite dev server's HMR
   * socket). The shared server's lifecycle is owned by the caller — closing
   * this transport detaches the upgrade listener without closing the server.
   */
  server?: HttpServer | HttpsServer
  /**
   * Port for the standalone WebSocket server. Defaults to `0`, which lets the
   * operating system assign an available port.
   */
  port?: number
  /** Host for the standalone WebSocket server. Defaults to `localhost`. */
  host?: string
  /**
   * Restrict the WS endpoint to a single upgrade route (e.g. `/__ws`). When
   * sharing a `server`, non-matching upgrade requests are left untouched for
   * other listeners to handle, so devframe's socket can sit alongside
   * framework sockets (Vite HMR, etc.).
   */
  path?: string
  /**
   * Create the adapter without binding it to anything: no server is created,
   * no port is bound, no `upgrade` listener is installed. The caller drives
   * the socket itself through {@link WsRpcTransport.handleUpgrade} (from its
   * own `upgrade` listener) or {@link WsRpcTransport.attach} (to bind a
   * server later). Takes precedence over `server` / `port` / `https`.
   */
  unbound?: boolean
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
  allowedOrigins?: readonly string[] | WsOriginRegistry | false
  /**
   * RPC function definitions, used by the per-call wire serializer to
   * dispatch between strict-JSON and structured-clone encoding based
   * on each function's `jsonSerializable` flag.
   *
   * When omitted, all messages fall back to structured-clone — safe but
   * loses dev-time validation for `jsonSerializable: true` declarations.
   */
  definitions?: ReadonlyMap<string, Pick<RpcFunctionDefinitionAny, 'jsonSerializable'>>
  onConnected?: (connection: DevframeRpcConnection, meta: DevframeNodeRpcSessionMeta) => void
  onDisconnected?: (connection: DevframeRpcConnection, meta: DevframeNodeRpcSessionMeta) => void
  /** Override the default per-call serializer. Most callers should leave this unset. */
  serialize?: ChannelOptions['serialize']
  /** Override the default per-call deserializer. Most callers should leave this unset. */
  deserialize?: ChannelOptions['deserialize']
}

export interface CreateWsOriginRegistryOptions {
  /** Origins allowed before any external viewers are registered. */
  allowedOrigins?: readonly string[]
  /** Additional validation to run after the registration token is verified. */
  validateOrigin?: (origin: string) => boolean
}

export interface WsOriginRegistry {
  /** Registration token to include in connection metadata. */
  readonly token: string
  /** Read and register an origin from a connection bootstrap URL. */
  registerFromUrl: (url: string) => string | undefined
  /** Check whether an origin is currently allowed. */
  isAllowed: (origin: string | undefined) => boolean
}

/**
 * Create a live, token-protected origin allowlist for external browser
 * viewers. Pass it to {@link WsRpcTransportOptions.allowedOrigins}, then use
 * `registerFromUrl()` in the connection metadata handler to authorize a
 * viewer without sharing a mutable array or disabling DNS-rebinding protection.
 */
export function createWsOriginRegistry(
  options: CreateWsOriginRegistryOptions = {},
): WsOriginRegistry {
  const token = randomToken()
  const origins = new Set(options.allowedOrigins ?? [])

  function normalizeOrigin(origin: string | undefined): string | undefined {
    if (!origin)
      return
    try {
      const url = new URL(origin)
      const normalized = url.origin === 'null'
        ? `${url.protocol}//${url.host}`
        : url.origin
      return origin === normalized ? normalized : undefined
    }
    catch {}
  }

  function registerOrigin(origin: string | undefined, candidateToken: string | undefined): boolean {
    const normalized = normalizeOrigin(origin)
    if (!normalized || !candidateToken || !timingSafeEqual(token, candidateToken))
      return false
    if (options.validateOrigin && !options.validateOrigin(normalized))
      return false
    origins.add(normalized)
    return true
  }

  const registry: WsOriginRegistry = {
    token,
    registerFromUrl(url) {
      let parsed: URL
      try {
        parsed = new URL(url, 'http://localhost')
      }
      catch {
        return
      }
      const origin = parsed.searchParams.get(DEVFRAME_VIEWER_ORIGIN_QUERY_PARAM) ?? undefined
      const candidateToken = parsed.searchParams.get(DEVFRAME_VIEWER_ORIGIN_TOKEN_QUERY_PARAM) ?? undefined
      return registerOrigin(origin, candidateToken) ? origin : undefined
    },
    isAllowed(origin) {
      return isAllowedOrigin(origin, [...origins])
    },
  }
  return registry
}

export interface WsRpcTransport {
  /**
   * The crossws node adapter driving the socket — exposes the connected
   * `peers` and pub/sub. See https://crossws.h3.dev.
   */
  ws: NodeAdapter
  /** Resolves when the transport-owned server is listening. */
  ready: Promise<void>
  /** Returns the bound address, or `null` when the server is not listening. */
  address: () => AddressInfo | string | null
  /**
   * Complete a `node:http` `upgrade` event on this transport, applying the
   * same `path` filter and origin gate the transport's own listener uses.
   * Wire it into a host server directly — `server.on('upgrade',
   * transport.handleUpgrade)` — or call it from an existing listener.
   */
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void
  /**
   * Route a server's `upgrade` events to this transport, returning a detach
   * function. Use it to bind an `unbound` transport once the host server
   * exists; {@link WsRpcTransport.close} detaches every server attached this
   * way (without closing them — the caller owns their lifecycle).
   */
  attach: (server: HttpServer | HttpsServer) => () => void
  /** Remove the upgrade listener from a shared `server` (a no-op otherwise). */
  detach: () => void
  /**
   * Tear the transport down deterministically: detach from a shared server,
   * force-terminate every connected peer, and close any server this
   * transport created itself (`port` / `https` modes).
   */
  close: () => Promise<void>
}

const EMPTY_DEFS: ReadonlyMap<string, Pick<RpcFunctionDefinitionAny, 'jsonSerializable'>> = new Map()

function NOOP() {}

function listen(
  server: HttpServer | HttpsServer,
  port: number,
  host: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    try {
      server.listen(port, host, () => {
        server.off('error', onError)
        resolve()
      })
    }
    catch (error) {
      server.off('error', onError)
      reject(error)
    }
  })
}

/** Compare two URL paths ignoring a trailing slash. */
function pathMatches(a: string, b: string): boolean {
  const strip = (p: string) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p)
  return strip(a) === strip(b)
}

/**
 * Whether `hostname` names a loopback host: `localhost` (or any `*.localhost`
 * subdomain), the IPv6 loopback `::1`, or an IPv4 literal inside the
 * `127.0.0.0/8` loopback block.
 *
 * The IPv4 case is matched **structurally** — the whole hostname must be a
 * canonical dotted-decimal IPv4 literal whose first octet is `127`. A bare
 * `startsWith('127.')` prefix check would also accept an attacker-controlled
 * DNS name that merely *begins* with `127.` (`127.attacker.example`,
 * `127.0.0.1.attacker.example`), letting a cross-origin browser page defeat
 * the loopback origin gate that guards the RPC/MCP surface (a DNS-rebinding /
 * cross-site WebSocket-hijacking bypass). Requiring a real IPv4 literal keeps
 * genuine loopback addresses (`127.0.0.1`, `127.5.5.5`) allowed while rejecting
 * those DNS names.
 */
export function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1')
    return true
  return isLoopbackIPv4(h)
}

/** A canonical dotted-decimal IPv4 literal in `127.0.0.0/8`. */
function isLoopbackIPv4(hostname: string): boolean {
  const octets = hostname.split('.')
  if (octets.length !== 4 || !octets.every(isDecimalOctet))
    return false
  return Number(octets[0]) === 127
}

/** A single canonical IPv4 octet: 1–3 digits, no leading zero, value 0–255. */
function isDecimalOctet(part: string): boolean {
  if (!/^\d{1,3}$/.test(part) || (part.length > 1 && part[0] === '0'))
    return false
  return Number(part) <= 255
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

function isWsOriginRegistry(
  value: readonly string[] | WsOriginRegistry | false | undefined,
): value is WsOriginRegistry {
  return !!value && !Array.isArray(value)
}

/**
 * Build the `upgrade` listener that hands a request to the crossws adapter,
 * optionally filtered to a single `path`. Non-matching requests are left
 * untouched so other upgrade listeners (e.g. a Vite dev server's HMR socket)
 * can claim them, unless `destroyUnmatched` is set.
 */
function createUpgradeListener(
  ws: NodeAdapter,
  path: string | undefined,
  destroyUnmatched: boolean,
  allowedOrigins: readonly string[] | WsOriginRegistry | false | undefined,
): (req: IncomingMessage, socket: Duplex, head: Buffer) => void {
  return (req, socket, head) => {
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
    const originAllowed = isWsOriginRegistry(allowedOrigins)
      ? allowedOrigins.isAllowed(req.headers.origin)
      : isAllowedOrigin(req.headers.origin, allowedOrigins || [])
    if (allowedOrigins !== false && !originAllowed) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    void ws.handleUpgrade(req, socket, head)
  }
}

/**
 * The per-peer lifecycle hooks driving a devframe RPC WebSocket, shaped for
 * any [crossws](https://crossws.h3.dev) adapter. {@link attachWsRpcTransport}
 * feeds them to the Node adapter; runtime-specific attachments (e.g. Bun's
 * fetch-upgrade adapter) reuse the same hooks so every transport speaks the
 * identical wire protocol — one birpc channel per peer, per-method
 * `jsonSerializable` dispatch between strict JSON and structured-clone.
 */
export function createWsRpcPeerHooks<
  ClientFunctions extends object,
  ServerFunctions extends object,
>(
  rpcGroup: BirpcGroup<ClientFunctions, ServerFunctions, false>,
  options: Pick<WsRpcTransportOptions, 'onConnected' | 'onDisconnected' | 'definitions' | 'serialize' | 'deserialize'> = {},
): Partial<Hooks> {
  const {
    onConnected = NOOP,
    onDisconnected = NOOP,
    definitions = EMPTY_DEFS,
    serialize: serializeOverride,
    deserialize: deserializeOverride,
  } = options

  interface PeerState {
    meta: DevframeNodeRpcSessionMeta
    connection: DevframeRpcConnection
    channel: ChannelOptions
    /** birpc's inbound-message handler, registered via the channel's `on`. */
    onMessage?: (data: string) => void
  }
  const states = new WeakMap<Peer, PeerState>()

  return {
    open: (peer) => {
      const meta = createRpcSessionMeta()
      meta.peer = peer
      const connection: DevframeRpcConnection = {
        id: meta.id,
        transport: 'websocket',
        request: peer.request,
        send: data => peer.send(data),
        close: (code, reason) => peer.close(code, reason),
        peer,
      }

      // Per-connection wire codec — one per session, so request-id spaces
      // don't collide across sessions.
      const codec = createRpcWireCodec(definitions)
      const state: PeerState = { meta, connection, channel: undefined as unknown as ChannelOptions }
      const channel: ChannelOptions = {
        post: (data) => {
          peer.send(data)
        },
        on: (fn) => {
          state.onMessage = fn
        },
        serialize: serializeOverride ?? codec.serialize,
        deserialize: deserializeOverride ?? codec.deserialize,
        meta,
      }
      state.channel = channel
      states.set(peer, state)

      rpcGroup.updateChannels((channels) => {
        channels.push(channel)
      })
      onConnected(connection, meta)
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
      onDisconnected(state.connection, state.meta)
    },
  }
}

/**
 * Attach a WebSocket transport to an existing RPC group, powered by
 * [crossws](https://crossws.h3.dev). Either attach to an existing HTTP(S)
 * `server` (sharing its port, optionally scoped to a `path`), or let this
 * helper create a standalone server from `port` / `host` / `https`.
 *
 * Returns the crossws node adapter, standalone-server readiness/address
 * accessors, `detach` (remove the upgrade listener from a shared `server`),
 * and `close` (full deterministic teardown).
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
    unbound,
    https,
    allowedOrigins,
  } = options

  const ws = crossws({
    hooks: createWsRpcPeerHooks(rpcGroup, options),
  })

  // One listener shape for every binding — the transport's own server, a
  // shared host server, and the caller-driven `handleUpgrade` / `attach`.
  const sharedUpgradeListener = createUpgradeListener(ws, path, destroyUnmatched, allowedOrigins)
  const ownedUpgradeListener = createUpgradeListener(ws, path, true, allowedOrigins)

  /** Bind a server's `upgrade` events, tracked so `close()` detaches them. */
  const attachments = new Set<() => void>()
  function attachTo(
    target: HttpServer | HttpsServer,
    listener: (req: IncomingMessage, socket: Duplex, head: Buffer) => void,
  ): () => void {
    target.on('upgrade', listener)
    const detachOne = (): void => {
      target.off('upgrade', listener)
      attachments.delete(detachOne)
    }
    attachments.add(detachOne)
    return detachOne
  }

  let ready = Promise.resolve()
  // A server created (and thus owned) by this transport. Nothing else
  // handles its upgrades, so off-route clients are rejected promptly.
  let ownedServer: HttpServer | HttpsServer | undefined
  if (unbound) {
    // Nothing to bind: the caller drives upgrades itself.
  }
  else if (server) {
    // Share an existing HTTP(S) server's port. Route upgrades ourselves so we
    // can coexist with the host's own upgrade handlers.
    attachTo(server, sharedUpgradeListener)
  }
  else if (https) {
    ownedServer = createHttpsServer(https)
    attachTo(ownedServer, ownedUpgradeListener)
    ready = listen(ownedServer, port ?? 0, host)
  }
  else {
    // Standalone server on its own port. Plain HTTP requests get the
    // WebSocket-only signal instead of hanging.
    ownedServer = createHttpServer((_req, res) => {
      res.writeHead(426, { 'content-type': 'text/plain' })
      res.end('Upgrade Required')
    })
    attachTo(ownedServer, ownedUpgradeListener)
    ready = listen(ownedServer, port ?? 0, host)
  }

  const activeServer = server ?? ownedServer

  function detachAll(): void {
    for (const detachOne of [...attachments])
      detachOne()
  }

  return {
    ws,
    ready,
    address: () => activeServer?.address() ?? null,
    handleUpgrade: sharedUpgradeListener,
    attach: target => attachTo(target, sharedUpgradeListener),
    detach: detachAll,
    async close() {
      // Detach our upgrade listeners first so a shared host server stops
      // routing new connections to us (and other handlers keep working).
      detachAll()
      // Force-terminate every peer so callers can deterministically tear
      // the server down (tests, hot reload, graceful shutdown) — a graceful
      // close would wait for clients to disconnect on their own.
      ws.closeAll(undefined, undefined, true)
      if (ownedServer) {
        const srv = ownedServer
        await ready.catch(() => {})
        if (!srv.listening)
          return
        await new Promise<void>(r => srv.close(() => r()))
      }
    },
  }
}
