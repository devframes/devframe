import type { ChannelOptions } from 'birpc'
import type { RpcFunctionDefinitionAny } from '../types'
import { DEVFRAME_AUTH_TOKEN_QUERY_PARAM, DEVFRAME_SSE_SESSION_HEADER } from 'devframe/constants'
import { createRpcWireCodec } from '../serialization'

export interface SseRpcChannelOptions {
  /** Resolved `http(s)://` URL of the SSE endpoint. */
  url: string
  onConnected?: () => void
  onError?: (e: Error) => void
  onDisconnected?: () => void
  authToken?: string
  /**
   * RPC function definitions (or just the `jsonSerializable` flag per
   * method) used to dispatch the per-call wire serializer — same contract
   * as the WS channel.
   */
  definitions?: ReadonlyMap<string, Pick<RpcFunctionDefinitionAny, 'jsonSerializable'>>
  /** Fetch implementation. Default: `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch
}

function NOOP(): void {}

/**
 * Build a birpc `ChannelOptions` object backed by an SSE stream (server →
 * client) and HTTP `POST` (client → server) — the WebSocket-free counterpart
 * to `createWsRpcChannel`, wire-compatible with `attachSseRpcTransport`.
 *
 * The stream is consumed via `fetch` streaming (not `EventSource`), so it
 * works in browsers and server runtimes alike. The server's first frame
 * (`event: session`) carries the session id; every `POST` echoes it in the
 * `x-birpc-session` header. A response to a client-initiated request comes
 * back in the `POST`'s own body and is re-injected into the channel; a
 * dropped stream terminates the channel — there is no reconnect, matching
 * the WS channel's closed-is-done semantics.
 */
export function createSseRpcChannel(options: SseRpcChannelOptions): ChannelOptions & { close: () => void } {
  const {
    onConnected = NOOP,
    onError = NOOP,
    onDisconnected = NOOP,
    definitions,
    fetch: fetchImpl = globalThis.fetch.bind(globalThis),
  } = options

  let url = options.url
  if (options.authToken)
    url = `${url}${url.includes('?') ? '&' : '?'}${DEVFRAME_AUTH_TOKEN_QUERY_PARAM}=${encodeURIComponent(options.authToken)}`

  const codec = createRpcWireCodec(definitions)
  const abort = new AbortController()
  let closed = false
  let onMessage: ((data: string) => void) | undefined
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined

  let resolveSession: (id: string) => void
  let rejectSession: (error: Error) => void
  const sessionReady = new Promise<string>((resolve, reject) => {
    resolveSession = resolve
    rejectSession = reject
  })
  // `close()` before the session frame arrives leaves the rejection
  // unobserved unless something always listens.
  sessionReady.catch(() => {})

  function fail(error: Error): void {
    if (closed)
      return
    closed = true
    rejectSession(error)
    onError(error)
    onDisconnected()
  }

  function end(): void {
    if (closed)
      return
    closed = true
    rejectSession(new Error('Devframe SSE stream closed'))
    onDisconnected()
  }

  function dispatch(event: string, data: string): void {
    if (event === 'session') {
      resolveSession(data)
      onConnected()
      return
    }
    onMessage?.(data)
  }

  /** Parse the SSE byte stream frame by frame and dispatch each event. */
  async function consume(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader()
    activeReader = reader
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done)
        break
      buffer += decoder.decode(value, { stream: true })
      // Frames are separated by a blank line.
      for (;;) {
        const boundary = buffer.search(/\n\n|\r\n\r\n/)
        if (boundary < 0)
          break
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + (buffer[boundary] === '\r' ? 4 : 2))
        let event = 'message'
        const data: string[] = []
        for (const rawLine of frame.split(/\r?\n/)) {
          if (rawLine.startsWith(':'))
            continue // comment frame (keep-alive ping)
          if (rawLine.startsWith('event:'))
            event = rawLine.slice(6).trimStart()
          else if (rawLine.startsWith('data:'))
            data.push(rawLine.slice(5).replace(/^ /, ''))
        }
        if (data.length > 0)
          dispatch(event, data.join('\n'))
      }
    }
    end()
  }

  void (async () => {
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'text/event-stream' },
        signal: abort.signal,
      })
      if (!response.ok || !response.body)
        throw new Error(`Devframe SSE stream request failed: ${response.status}`)
      await consume(response.body)
    }
    catch (error) {
      if (abort.signal.aborted) {
        end()
        return
      }
      fail(error instanceof Error ? error : new Error(String(error)))
    }
  })()

  return {
    close: () => {
      closed = true
      abort.abort()
      // `fetch` implementations wired to the abort signal cancel the body
      // themselves; cancel the reader explicitly too so a handler-style
      // `fetch` (tests, custom transports) also propagates the teardown to
      // the server's stream source.
      void activeReader?.cancel().catch(() => {})
    },
    on: (handler: (data: string) => void) => {
      onMessage = handler
    },
    post: async (data: string) => {
      let sessionId: string
      try {
        sessionId = await sessionReady
      }
      catch {
        // The stream never opened (or already closed) — the error surfaced
        // through `onError`/`onDisconnected`; nothing to send.
        return
      }
      if (closed) {
        onError(new Error('Devframe SSE channel is closed; message dropped'))
        return
      }
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            [DEVFRAME_SSE_SESSION_HEADER]: sessionId,
          },
          body: data,
        })
        if (response.status === 200) {
          // The parked response to a client-initiated request rides the
          // POST body — re-inject it so birpc correlates it by id.
          const body = await response.text()
          if (body)
            onMessage?.(body)
          return
        }
        if (!response.ok)
          throw new Error(`Devframe SSE POST failed: ${response.status}`)
      }
      catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    },
    serialize: codec.serialize,
    deserialize: codec.deserialize,
  }
}
