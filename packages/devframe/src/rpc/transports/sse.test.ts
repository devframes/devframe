import type { DevframeNodeRpcSessionMeta, DevframeRpcConnection } from './session'
import { describe, expect, it, vi } from 'vitest'
import { createRpcClient } from '../client'
import { createRpcServer } from '../server'
import { createSseRpcChannel } from './sse-client'
import { attachSseRpcTransport } from './sse-server'

interface ServerFunctions {
  hello: (name: string) => string
  echoMap: (input: Map<string, number>) => Map<string, number>
  boom: () => never
}

interface ClientFunctions {
  notify: (value: string) => void
}

/**
 * Wire the client channel straight into the server transport's fetch
 * handler — the full SSE wire protocol (stream frames, session header,
 * parked POSTs) without a real HTTP server.
 */
function connectPair(options: {
  serverOptions?: Parameters<typeof attachSseRpcTransport>[1]
  clientFunctions?: Partial<ClientFunctions>
  origin?: string
  channelUrl?: string
} = {}) {
  const rpcGroup = createRpcServer<ClientFunctions, ServerFunctions>({
    hello: (name: string) => `hello ${name}`,
    echoMap: (input: Map<string, number>) => input,
    boom: () => {
      throw new Error('kaboom')
    },
  })
  const transport = attachSseRpcTransport(rpcGroup, options.serverOptions)

  const fetchImpl: typeof fetch = async (input, init) => {
    const request = new Request(input, {
      ...init,
      ...(options.origin ? { headers: mergeOrigin(init?.headers, options.origin) } : {}),
    })
    return transport.handler(request)
  }

  const channel = createSseRpcChannel({
    url: options.channelUrl ?? 'http://localhost/__sse',
    fetch: fetchImpl,
  })
  const client = createRpcClient<ServerFunctions, ClientFunctions>(
    (options.clientFunctions ?? {}) as ClientFunctions,
    { channel },
  )
  return { rpcGroup, transport, channel, client }
}

function mergeOrigin(headers: HeadersInit | undefined, origin: string): Headers {
  const merged = new Headers(headers)
  merged.set('origin', origin)
  return merged
}

describe('sse transport pair', () => {
  it('answers a client-initiated call through the parked POST', async () => {
    const { client, transport } = connectPair()
    await expect(client.$call('hello', 'sse')).resolves.toBe('hello sse')
    expect(transport.sessionCount()).toBe(1)
  })

  it('round-trips structured-clone values (Map)', async () => {
    const { client } = connectPair()
    const result = await client.$call('echoMap', new Map([['a', 1]]))
    expect(result).toBeInstanceOf(Map)
    expect(result.get('a')).toBe(1)
  })

  it('propagates thrown errors back to the caller', async () => {
    const { client } = connectPair()
    await expect(client.$call('boom')).rejects.toThrow('kaboom')
  })

  it('delivers server-initiated calls over the stream', async () => {
    const received: string[] = []
    const { client, rpcGroup } = connectPair({
      clientFunctions: { notify: value => void received.push(value) },
    })
    // Establish the session first so the broadcast has a live channel.
    await client.$call('hello', 'x')
    rpcGroup.broadcast.$callEvent('notify', 'from-server')
    await vi.waitFor(() => expect(received).toEqual(['from-server']))
  })

  it('marks sessions with the sse transport kind and fires lifecycle hooks', async () => {
    const connects: DevframeRpcConnection[] = []
    const disconnects: DevframeNodeRpcSessionMeta[] = []
    const { client, channel, transport } = connectPair({
      serverOptions: {
        onConnected: connection => void connects.push(connection),
        onDisconnected: (_connection, meta) => void disconnects.push(meta),
      },
    })
    await client.$call('hello', 'x')
    expect(connects).toHaveLength(1)
    expect(connects[0]!.transport).toBe('sse')
    expect(connects[0]!.request?.url).toContain('/__sse')
    channel.close()
    await vi.waitFor(() => expect(transport.sessionCount()).toBe(0))
    expect(disconnects).toHaveLength(1)
  })

  it('rejects a POST with an unknown session id', async () => {
    const rpcGroup = createRpcServer<ClientFunctions, ServerFunctions>({} as any)
    const transport = attachSseRpcTransport(rpcGroup)
    const response = await transport.handler(new Request('http://localhost/__sse', {
      method: 'POST',
      headers: { 'x-birpc-session': 'nope' },
      body: '{}',
    }))
    expect(response.status).toBe(400)
  })

  it('rejects a disallowed origin with 403 and allows loopback origins', async () => {
    const rpcGroup = createRpcServer<ClientFunctions, ServerFunctions>({} as any)
    const transport = attachSseRpcTransport(rpcGroup)
    const forbidden = await transport.handler(new Request('http://localhost/__sse', {
      headers: { origin: 'https://evil.example' },
    }))
    expect(forbidden.status).toBe(403)

    const { client } = connectPair({ origin: 'http://localhost:5173' })
    await expect(client.$call('hello', 'loopback')).resolves.toBe('hello loopback')
  })

  it('emits CORS headers for allowed cross-origin viewers', async () => {
    const rpcGroup = createRpcServer<ClientFunctions, ServerFunctions>({} as any)
    const transport = attachSseRpcTransport(rpcGroup, {
      allowedOrigins: ['https://viewer.example'],
    })
    const preflight = await transport.handler(new Request('http://localhost/__sse', {
      method: 'OPTIONS',
      headers: { origin: 'https://viewer.example' },
    }))
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://viewer.example')
    expect(preflight.headers.get('access-control-allow-headers')).toContain('x-birpc-session')
  })

  it('appends the auth token as a query param on the stream request', async () => {
    const urls: string[] = []
    const rpcGroup = createRpcServer<ClientFunctions, ServerFunctions>({} as any)
    const transport = attachSseRpcTransport(rpcGroup)
    const channel = createSseRpcChannel({
      url: 'http://localhost/__sse',
      authToken: 'a b/c+d',
      fetch: async (input, init) => {
        urls.push(String(input))
        return transport.handler(new Request(input, init))
      },
    })
    await vi.waitFor(() => expect(urls.length).toBeGreaterThan(0))
    expect(urls[0]).toBe('http://localhost/__sse?devframe_auth_token=a%20b%2Fc%2Bd')
    channel.close()
  })

  it('settles a parked POST with 409 when the session closes mid-call', async () => {
    let release: (() => void) | undefined
    let sawHang = false
    const rpcGroup = createRpcServer<ClientFunctions, { hang: () => Promise<void> }>({
      hang: () => new Promise<void>((resolve) => {
        sawHang = true
        release = resolve
      }),
    })
    const transport = attachSseRpcTransport(rpcGroup)
    const errors: Error[] = []
    const channel = createSseRpcChannel({
      url: 'http://localhost/__sse',
      fetch: async (input, init) => transport.handler(new Request(input, init)),
      onError: error => void errors.push(error),
    })
    const client = createRpcClient<{ hang: () => Promise<void> }, ClientFunctions>(
      {} as ClientFunctions,
      { channel },
    )
    // The channel itself never settles the birpc call (matching the WS
    // channel); the client *mode* layer rejects pending calls on
    // disconnect. Here we assert the wire behavior: the parked POST is
    // released with a 409 and surfaces through `onError`.
    void client.$call('hang').catch(() => {})
    await vi.waitFor(() => expect(sawHang).toBe(true))
    transport.close()
    await vi.waitFor(() => expect(errors.length).toBeGreaterThan(0))
    expect(errors[0]!.message).toContain('409')
    release?.()
  })
})
