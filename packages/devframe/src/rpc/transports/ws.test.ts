import { createServer } from 'node:http'
import { getPort } from 'get-port-please'
import { describe, expect, it, vi } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import { createRpcClient } from '../client'
import { createRpcServer } from '../server'
import { createWsRpcChannel } from './ws-client'
import { attachWsRpcTransport, isAllowedOrigin, isLoopbackHostname } from './ws-server'

vi.stubGlobal('WebSocket', WebSocket)

describe('ws auth token in URL', () => {
  it('appends the auth token as a URL query param, url-encoded, and omits it when absent', () => {
    const urls: string[] = []
    class CapturingWS {
      constructor(public url: string) {
        urls.push(url)
      }

      addEventListener() {}
      removeEventListener() {}
      send() {}
      readyState = 0
    }

    try {
      vi.stubGlobal('WebSocket', CapturingWS)
      createWsRpcChannel({ url: 'ws://127.0.0.1:1234' })
      createWsRpcChannel({ url: 'ws://127.0.0.1:1234', authToken: 'a b/c+d' })

      expect(urls[0]).toBe('ws://127.0.0.1:1234')
      expect(urls[1]).toBe('ws://127.0.0.1:1234?devframe_auth_token=a%20b%2Fc%2Bd')
    }
    finally {
      // Restore the real ws implementation for the connection tests below.
      vi.stubGlobal('WebSocket', WebSocket)
    }
  })
})

describe('devframe rpc', () => {
  it('should work w/ ws transport', async () => {
    // Use 127.0.0.1 on both client and server so they agree on the
    // address family — `localhost` resolution is ambiguous (IPv4 vs IPv6)
    // and differs between Windows/macOS/Linux, which causes the client
    // to hang when the two sides pick opposite families.
    const HOST = '127.0.0.1'
    const PORT = await getPort({ host: HOST, random: true })
    const WS_URL = `ws://${HOST}:${PORT}`

    const serverFunctions = {
      hello: (no: number) => {
        return `hello world from client ${no}`
      },
    }

    const client1Functions = {
      hey: (name: string) => {
        return `hey ${name}, I'm client 1`
      },
    }

    const client2Functions = {
      hey: (name: string) => {
        return `hey ${name}, I'm client 2`
      },
    }

    const server = createRpcServer<typeof client1Functions | typeof client2Functions, typeof serverFunctions>(serverFunctions)
    attachWsRpcTransport(server, { port: PORT, host: HOST })

    const client1 = createRpcClient<typeof serverFunctions, typeof client1Functions>(client1Functions, {
      channel: createWsRpcChannel({ url: WS_URL }),
    })

    const client2 = createRpcClient<typeof serverFunctions, typeof client2Functions>(client2Functions, {
      channel: createWsRpcChannel({ url: WS_URL }),
    })

    expect(await client1.$call('hello', 1)).toBe('hello world from client 1')

    expect(await client2.$call('hello', 2)).toBe('hello world from client 2')

    expect(await server.broadcast.$call('hey', 'server')).toEqual(expect.arrayContaining(['hey server, I\'m client 1', 'hey server, I\'m client 2']))
  })

  it('shares a server with another WS handler, scoped to its own path', async () => {
    const HOST = '127.0.0.1'
    const PORT = await getPort({ host: HOST, random: true })
    const httpServer = createServer()
    await new Promise<void>(r => httpServer.listen(PORT, HOST, () => r()))

    // A second WS server on the same http server, simulating a framework's own
    // socket (e.g. Vite HMR). It owns a different route and must keep working.
    const other = new WebSocketServer({ noServer: true })
    const otherConnections: string[] = []
    httpServer.on('upgrade', (req, socket, head) => {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost')
      if (pathname !== '/__hmr')
        return
      other.handleUpgrade(req, socket, head, (ws) => {
        otherConnections.push('hmr')
        ws.close()
      })
    })

    const serverFunctions = { ping: () => 'pong' }
    const server = createRpcServer<Record<string, never>, typeof serverFunctions>(serverFunctions)
    const { close } = attachWsRpcTransport(server, { server: httpServer, path: '/__devframe_ws' })

    try {
      const client = createRpcClient<typeof serverFunctions, Record<string, never>>({}, {
        channel: createWsRpcChannel({ url: `ws://${HOST}:${PORT}/__devframe_ws` }),
      })
      expect(await client.$call('ping')).toBe('pong')

      // The co-located socket still receives its own-route connections.
      const hmr = new WebSocket(`ws://${HOST}:${PORT}/__hmr`)
      await new Promise<void>((resolve, reject) => {
        hmr.on('close', () => resolve())
        hmr.on('error', reject)
      })
      expect(otherConnections).toEqual(['hmr'])
    }
    finally {
      await close()
      other.close()
      await new Promise<void>(r => httpServer.close(() => r()))
    }
  })

  // Regression: a `jsonSerializable: true` RPC that throws used to crash the
  // WS serializer with DF0020 because the error envelope was strict-JSON-encoded
  // alongside the result path.
  it('returns a rejection (not a serialization crash) when a jsonSerializable RPC throws', async () => {
    const HOST = '127.0.0.1'
    const PORT = await getPort({ host: HOST, random: true })
    const WS_URL = `ws://${HOST}:${PORT}`

    const serverFunctions = {
      explode: async () => {
        throw new Error('boom')
      },
    }

    const definitions = new Map<string, { jsonSerializable?: boolean }>([
      ['explode', { jsonSerializable: true }],
    ])

    const server = createRpcServer<Record<string, never>, typeof serverFunctions>(serverFunctions)
    const { close } = attachWsRpcTransport(server, { port: PORT, host: HOST, definitions })

    try {
      const client = createRpcClient<typeof serverFunctions, Record<string, never>>({}, {
        channel: createWsRpcChannel({ url: WS_URL, definitions }),
      })

      await expect(client.$call('explode')).rejects.toThrow(/boom/)
    }
    finally {
      await close()
    }
  })
})

describe('ws origin check', () => {
  it('isLoopbackHostname / isAllowedOrigin recognize loopback hosts', () => {
    expect(isLoopbackHostname('localhost')).toBe(true)
    expect(isLoopbackHostname('127.0.0.1')).toBe(true)
    expect(isLoopbackHostname('127.5.5.5')).toBe(true)
    expect(isLoopbackHostname('::1')).toBe(true)
    expect(isLoopbackHostname('foo.localhost')).toBe(true)
    expect(isLoopbackHostname('evil.example')).toBe(false)

    expect(isAllowedOrigin(undefined, [])).toBe(true)
    expect(isAllowedOrigin('http://localhost:5173', [])).toBe(true)
    expect(isAllowedOrigin('http://evil.example', [])).toBe(false)
    expect(isAllowedOrigin('http://evil.example', ['http://evil.example'])).toBe(true)
  })

  async function connectRaw(url: string, origin?: string): Promise<'open' | 'closed'> {
    return await new Promise((resolve) => {
      const ws = new WebSocket(url, origin ? { headers: { origin } } : undefined)
      ws.on('open', () => {
        ws.close()
        resolve('open')
      })
      ws.on('error', () => resolve('closed'))
      ws.on('unexpected-response', () => resolve('closed'))
    })
  }

  it('rejects a cross-origin browser upgrade', async () => {
    const HOST = '127.0.0.1'
    const PORT = await getPort({ host: HOST, random: true })
    const server = createRpcServer<Record<string, never>, Record<string, never>>({})
    const { close } = attachWsRpcTransport(server, { port: PORT, host: HOST })

    try {
      const result = await connectRaw(`ws://${HOST}:${PORT}`, 'http://evil.example')
      expect(result).toBe('closed')
    }
    finally {
      await close()
    }
  })

  it('allows a loopback origin', async () => {
    const HOST = '127.0.0.1'
    const PORT = await getPort({ host: HOST, random: true })
    const server = createRpcServer<Record<string, never>, Record<string, never>>({})
    const { close } = attachWsRpcTransport(server, { port: PORT, host: HOST })

    try {
      const result = await connectRaw(`ws://${HOST}:${PORT}`, 'http://localhost:12345')
      expect(result).toBe('open')
    }
    finally {
      await close()
    }
  })

  it('allows a request with no Origin header (native client)', async () => {
    const HOST = '127.0.0.1'
    const PORT = await getPort({ host: HOST, random: true })
    const server = createRpcServer<Record<string, never>, Record<string, never>>({})
    const { close } = attachWsRpcTransport(server, { port: PORT, host: HOST })

    try {
      const result = await connectRaw(`ws://${HOST}:${PORT}`)
      expect(result).toBe('open')
    }
    finally {
      await close()
    }
  })

  it('honors allowedOrigins for an otherwise-disallowed origin', async () => {
    const HOST = '127.0.0.1'
    const PORT = await getPort({ host: HOST, random: true })
    const server = createRpcServer<Record<string, never>, Record<string, never>>({})
    const { close } = attachWsRpcTransport(server, { port: PORT, host: HOST, allowedOrigins: ['http://evil.example'] })

    try {
      const result = await connectRaw(`ws://${HOST}:${PORT}`, 'http://evil.example')
      expect(result).toBe('open')
    }
    finally {
      await close()
    }
  })
})
