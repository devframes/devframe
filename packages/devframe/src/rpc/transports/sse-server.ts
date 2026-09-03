import type { BirpcGroup, ChannelOptions } from 'birpc'
import type { RpcFunctionDefinitionAny } from '../types'
import type { DevframeNodeRpcSessionMeta, DevframeRpcConnection } from './session'
import type { WsOriginRegistry } from './ws-server'
import { DEVFRAME_SSE_SESSION_HEADER } from 'devframe/constants'
import { isAllowedOrigin } from 'devframe/utils/origin'
import { createRpcWireCodec, peekRpcWireFrame } from '../wire-codec'
import { createRpcSessionMeta } from './session'

export interface SseRpcTransportOptions {
  /**
   * Same contract as `WsRpcTransportOptions.allowedOrigins`: extra origins
   * to accept beyond the loopback default, a live origin registry, or
   * `false` to disable the gate. Applied to the stream `GET`, the RPC
   * `POST`, and the CORS preflight alike.
   */
  allowedOrigins?: readonly string[] | WsOriginRegistry | false
  /**
   * RPC function definitions, used by the per-call wire serializer to
   * dispatch between strict-JSON and structured-clone encoding based on
   * each function's `jsonSerializable` flag. When omitted, all messages
   * fall back to structured-clone, the same contract as the WS transport.
   */
  definitions?: ReadonlyMap<string, Pick<RpcFunctionDefinitionAny, 'jsonSerializable'>>
  onConnected?: (connection: DevframeRpcConnection, meta: DevframeNodeRpcSessionMeta) => void
  onDisconnected?: (connection: DevframeRpcConnection, meta: DevframeNodeRpcSessionMeta) => void
  /**
   * Milliseconds between keep-alive comment frames (`: ping`) written to
   * every open stream, so intermediaries (reverse proxies, tunnels) don't
   * drop an idle connection. `0` disables. Default: `30_000`.
   */
  keepAliveInterval?: number
  /** Mint a session id. Default: `crypto.randomUUID`. */
  generateSessionId?: () => string
}

export interface SseRpcTransport {
  /**
   * Web-standard handler for the SSE route: `GET` opens the event stream,
   * `POST` carries RPC frames (session id in the `x-birpc-session` header),
   * `OPTIONS` answers the CORS preflight for registered cross-origin
   * viewers. Mount it on the route the connection meta advertises.
   */
  handler: (request: Request) => Promise<Response> | Response
  /** Number of currently connected SSE sessions. */
  sessionCount: () => number
  /** Terminate every open stream and detach their birpc channels. */
  close: () => void
}

const SSE_STREAM_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache, no-transform',
  /** Tell buffering reverse proxies (nginx) to pass frames through as-is. */
  'x-accel-buffering': 'no',
} as const

function NOOP(): void {}

interface SseSession {
  id: string
  meta: DevframeNodeRpcSessionMeta
  connection?: DevframeRpcConnection
  channel?: ChannelOptions
  /** birpc's inbound-message handler, registered via the channel's `on`. */
  onMessage?: (data: string) => void
  /** Parked `POST` responses, keyed by the birpc request id they await. */
  parked: Map<string, (body: string | null) => void>
  closed: boolean
  close: () => void
}

/**
 * Attach an SSE + HTTP POST transport to an existing RPC group: the
 * WebSocket-free counterpart to `attachWsRpcTransport`, for hosts and
 * proxies where the upgrade isn't available. Speaks the same birpc wire
 * protocol (one channel per session, per-method `jsonSerializable`
 * dispatch) over a half-duplex pair, mirroring birpc's own SSE helpers:
 *
 *  - the server mints a session id as the stream's first frame
 *    (`event: session`);
 *  - every client `POST` echoes it in the `x-birpc-session` header;
 *  - a client-initiated request's response comes back in that `POST`'s
 *    own body (parked until the handler answers);
 *  - server-initiated calls/events stream down as `event: message`
 *    frames, and the client's replies up via `POST` get a bare `202`.
 */
export function attachSseRpcTransport<
  ClientFunctions extends object,
  ServerFunctions extends object,
>(
  rpcGroup: BirpcGroup<ClientFunctions, ServerFunctions, false>,
  options: SseRpcTransportOptions = {},
): SseRpcTransport {
  const {
    allowedOrigins,
    definitions,
    onConnected = NOOP,
    onDisconnected = NOOP,
    keepAliveInterval = 30_000,
    generateSessionId = () => crypto.randomUUID(),
  } = options

  const sessions = new Map<string, SseSession>()
  const encoder = new TextEncoder()

  function originAllowed(request: Request): boolean {
    if (allowedOrigins === false)
      return true
    const origin = request.headers.get('origin') ?? undefined
    return allowedOrigins && !Array.isArray(allowedOrigins)
      ? (allowedOrigins as WsOriginRegistry).isAllowed(origin)
      : isAllowedOrigin(origin, (allowedOrigins as readonly string[] | undefined) ?? [])
  }

  /**
   * CORS headers for a browser on another (allowed) origin: the side-car /
   * registered-viewer case. Same-origin requests carry no `Origin` (or their
   * own), where these headers are inert.
   */
  function corsHeaders(request: Request): Record<string, string> {
    const origin = request.headers.get('origin')
    if (!origin)
      return {}
    return {
      'access-control-allow-origin': origin,
      'vary': 'origin',
    }
  }

  function openStream(request: Request): Response {
    const meta = createRpcSessionMeta()
    const id = generateSessionId()
    const codec = createRpcWireCodec(definitions)

    let controller: ReadableStreamDefaultController<Uint8Array> | undefined
    let keepAlive: ReturnType<typeof setInterval> | undefined
    let closeSession = (): void => {}

    function write(text: string): void {
      try {
        controller?.enqueue(encoder.encode(text))
      }
      catch {
        // The stream is gone (client vanished mid-write); tear down so the
        // session doesn't linger as a zombie.
        closeSession()
      }
    }

    function writeEvent(event: string, data: string): void {
      // SSE joins multi-line data on the receiving side; wire frames are
      // single-line JSON text, but split defensively so an embedded newline
      // can never break the framing.
      const body = data.split('\n').map(line => `data: ${line}`).join('\n')
      write(`event: ${event}\n${body}\n\n`)
    }

    const session: SseSession = {
      id,
      meta,
      parked: new Map(),
      closed: false,
      close: () => {
        if (session.closed)
          return
        session.closed = true
        if (keepAlive)
          clearInterval(keepAlive)
        sessions.delete(id)
        // A parked POST can no longer be answered, so release it so the HTTP
        // request settles instead of hanging.
        for (const resolve of session.parked.values()) resolve(null)
        session.parked.clear()
        try {
          controller?.close()
        }
        catch {}
        rpcGroup.updateChannels((channels) => {
          const index = session.channel ? channels.indexOf(session.channel) : -1
          if (index >= 0)
            channels.splice(index, 1)
        })
        onDisconnected(session.connection!, meta)
      },
    }
    closeSession = session.close

    const connection: DevframeRpcConnection = {
      id: meta.id,
      transport: 'sse',
      request,
      send: data => writeEvent('message', data),
      close: () => session.close(),
    }
    session.connection = connection

    const channel: ChannelOptions = {
      post: (data: string) => {
        // A response to a client-initiated request completes the parked
        // POST that carried it; everything else (server-initiated calls,
        // events) streams down.
        const { t, i } = peekRpcWireFrame(data)
        if (t === 's' && i) {
          const resolve = session.parked.get(i)
          if (resolve) {
            session.parked.delete(i)
            resolve(data)
            return
          }
        }
        writeEvent('message', data)
      },
      on: (fn) => {
        session.onMessage = fn
      },
      serialize: codec.serialize,
      deserialize: codec.deserialize,
      meta,
    }
    session.channel = channel

    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c
        sessions.set(id, session)
        rpcGroup.updateChannels((channels) => {
          channels.push(channel)
        })
        write(`event: session\ndata: ${id}\n\n`)
        if (keepAliveInterval > 0) {
          keepAlive = setInterval(write, keepAliveInterval, ': ping\n\n')
          // Never hold the process open for idle keep-alives.
          ;(keepAlive as { unref?: () => void }).unref?.()
        }
        onConnected(connection, meta)
      },
      cancel() {
        session.close()
      },
    })

    return new Response(body, {
      status: 200,
      headers: { ...SSE_STREAM_HEADERS, ...corsHeaders(request) },
    })
  }

  async function handlePost(request: Request): Promise<Response> {
    const id = request.headers.get(DEVFRAME_SSE_SESSION_HEADER)
    const session = id ? sessions.get(id) : undefined
    if (!session || session.closed) {
      return new Response('Unknown SSE session', {
        status: 400,
        headers: corsHeaders(request),
      })
    }
    const frame = await request.text()
    const { t, i } = peekRpcWireFrame(frame)
    // A client-initiated request: park this POST until the handler's
    // response comes back through the channel, and answer with it inline.
    if (t === 'q' && i) {
      const parked = new Promise<string | null>((resolve) => {
        session.parked.set(i, resolve)
      })
      session.onMessage?.(frame)
      const responseBody = await parked
      if (responseBody == null) {
        return new Response('SSE session closed before the response settled', {
          status: 409,
          headers: corsHeaders(request),
        })
      }
      return new Response(responseBody, {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8', ...corsHeaders(request) },
      })
    }
    // A client event or a reply to a server-initiated call: nothing to
    // send back on this request.
    session.onMessage?.(frame)
    return new Response(null, { status: 202, headers: corsHeaders(request) })
  }

  function handlePreflight(request: Request): Response {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': `content-type, ${DEVFRAME_SSE_SESSION_HEADER}`,
        'access-control-max-age': '86400',
        ...corsHeaders(request),
      },
    })
  }

  return {
    handler: (request: Request): Promise<Response> | Response => {
      if (!originAllowed(request))
        return new Response('Forbidden', { status: 403 })
      switch (request.method) {
        case 'GET':
          return openStream(request)
        case 'POST':
          return handlePost(request)
        case 'OPTIONS':
          return handlePreflight(request)
        default:
          return new Response('Method Not Allowed', {
            status: 405,
            headers: { allow: 'GET, POST, OPTIONS' },
          })
      }
    },
    sessionCount: () => sessions.size,
    close: () => {
      for (const session of [...sessions.values()]) session.close()
    },
  }
}
