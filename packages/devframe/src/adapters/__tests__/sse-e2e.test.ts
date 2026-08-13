import type { DevframeNodeContext, DevframeRpcClientFunctions, DevframeRpcServerFunctions } from '../../types'
import { createServer } from 'node:http'
import { defineDevframe } from 'devframe'
import { getDevframeRpcClient, resolveClientTransport } from 'devframe/client'
import { createRpcClient } from 'devframe/rpc/client'
import { createSseRpcChannel } from 'devframe/rpc/transports/sse-client'
import { getPort } from 'get-port-please'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initDevframe } from '../initiate'

const HOST = '127.0.0.1'
// Globals `setupDevframeConnection` publishes/reads for same-realm reuse —
// cleared between tests so each one dials its own freshly-booted server.
const CONNECTION_GLOBALS = [
  '__DEVFRAME_CONNECTION_META__',
  '__DEVFRAME_CONNECTION_AUTH_TOKEN__',
  '__DEVFRAME_CONNECTION__',
] as const

function defineTestDef(id: string) {
  return defineDevframe({
    id,
    name: 'SSE Test',
    version: '0.0.0',
    packageName: 'devframe-sse-test',
    homepage: 'https://example.test',
    description: 'Test devframe.',
    setup: (ctx: DevframeNodeContext) => {
      ctx.rpc.register({ name: 'test:probe', type: 'query', handler: () => 'ok' })
      ctx.rpc.register({ name: 'test:echo-map', type: 'query', handler: (input: Map<string, number>) => input })
    },
  })
}

/** Boot a shared-server instance (dev-server shape) and return its origin. */
async function bootServer(id: string, options: { ws?: false, sse?: boolean } = {}) {
  const base = `/__${id}/`
  const port = await getPort({ random: true, host: HOST })
  const devframe = initDevframe(defineTestDef(id), {
    base,
    auth: false,
    host: HOST,
    ...(options.ws === false ? { ws: false } : {}),
    ...(options.sse === false ? { sse: false } : {}),
  })
  // Devframe under its base via the node middleware; host fallback otherwise.
  const server = createServer((req, res) => {
    devframe.nodeMiddleware(req, res, () => {
      res.statusCode = 418
      res.end('host app')
    })
  })
  if (options.ws !== false)
    devframe.attach(server)
  await new Promise<void>(resolve => server.listen(port, HOST, resolve))
  await devframe.ready
  return {
    devframe,
    origin: `http://${HOST}:${port}`,
    base,
    close: async () => {
      await devframe.close()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}

describe('sse transport e2e', () => {
  it('serves the SSE endpoint alongside the WebSocket and advertises both', async () => {
    const { devframe, origin, base, close } = await bootServer('sse-both')
    try {
      const meta = devframe.connectionMeta()
      expect(meta.backend).toBe('websocket')
      expect(meta.sse).toEqual({ path: '__sse' })

      const channel = createSseRpcChannel({ url: `${origin}${base}__sse` })
      const client = createRpcClient<DevframeRpcServerFunctions, DevframeRpcClientFunctions>(
        {} as DevframeRpcClientFunctions,
        { channel },
      )
      await expect((client as any).$call('test:probe')).resolves.toBe('ok')
      // Structured-clone round-trip over the POST/stream pair.
      const echoed = await (client as any).$call('test:echo-map', new Map([['k', 7]]))
      expect(echoed).toBeInstanceOf(Map)
      expect(echoed.get('k')).toBe(7)
      channel.close()
    }
    finally {
      await close()
    }
  })

  it('ws: false serves SSE-only and reports backend "sse"', async () => {
    const { devframe, origin, base, close } = await bootServer('sse-only', { ws: false })
    try {
      const meta = devframe.connectionMeta()
      expect(meta.backend).toBe('sse')
      expect(meta.websocket).toBeUndefined()
      expect(meta.sse).toEqual({ path: '__sse' })

      // The upgrade surface is gone — driving it is a coded error.
      expect(() => devframe.handleUpgrade({} as any, {} as any, {} as any)).toThrow(/DF0057|ws: false/)

      const channel = createSseRpcChannel({ url: `${origin}${base}__sse` })
      const client = createRpcClient<DevframeRpcServerFunctions, DevframeRpcClientFunctions>(
        {} as DevframeRpcClientFunctions,
        { channel },
      )
      await expect((client as any).$call('test:probe')).resolves.toBe('ok')
      channel.close()
    }
    finally {
      await close()
    }
  })

  it('ws: false + sse: false runs an RPC-less shell with backend "none"', async () => {
    const { devframe, origin, base, close } = await bootServer('sse-none', { ws: false, sse: false })
    try {
      const meta = devframe.connectionMeta()
      expect(meta.backend).toBe('none')
      expect(meta.websocket).toBeUndefined()
      expect(meta.sse).toBeUndefined()

      // The HTTP surface still works (discovery meta serves).
      const res = await fetch(`${origin}${base}__connection.json`)
      expect(res.status).toBe(200)

      // The SSE route is not mounted.
      const sseRes = await fetch(`${origin}${base}__sse`)
      expect(sseRes.status).toBe(404)

      // A client resolves this to a clear "nothing to connect to" error.
      expect(() => resolveClientTransport('auto', meta)).toThrow(/no RPC transport/)
    }
    finally {
      await close()
    }
  })

  it('rejects a disallowed origin on the SSE route with 403', async () => {
    const { origin, base, close } = await bootServer('sse-origin')
    try {
      const forbidden = await fetch(`${origin}${base}__sse`, {
        headers: { origin: 'https://evil.example' },
      })
      expect(forbidden.status).toBe(403)
    }
    finally {
      await close()
    }
  })
})

describe('sse transport e2e — full client', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { userAgent: 'vitest' })
    for (const key of CONNECTION_GLOBALS) delete (globalThis as any)[key]
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    for (const key of CONNECTION_GLOBALS) delete (globalThis as any)[key]
  })

  function stubLocation(origin: string, base: string): void {
    vi.stubGlobal('location', {
      protocol: 'http:',
      host: new URL(origin).host,
      hostname: new URL(origin).hostname,
      href: `${origin}${base}index.html`,
      origin,
    })
  }

  it('connectDevframe picks SSE when pinned, handshakes, and exposes the transport', async () => {
    const { origin, base, close } = await bootServer('sse-client-pin')
    try {
      stubLocation(origin, base)
      const client = await getDevframeRpcClient({
        baseURL: `${origin}${base}`,
        transport: 'sse',
        otpParam: false,
        simpleAuth: false,
      })
      expect(client.transport).toBe('sse')
      // auth: false auto-trusts through the SSE handshake.
      await client.ensureTrusted(5000)
      expect(client.isTrusted).toBe(true)
      expect(client.status).toBe('connected')
      await expect((client.call as any)('test:probe')).resolves.toBe('ok')
      client.close?.()
    }
    finally {
      await close()
    }
  })

  it('auto mode prefers the WebSocket when both are advertised and SSE when it is primary', async () => {
    const both = await bootServer('sse-client-auto')
    try {
      expect(resolveClientTransport('auto', both.devframe.connectionMeta())).toBe('websocket')
    }
    finally {
      await both.close()
    }

    const sseOnly = await bootServer('sse-client-auto2', { ws: false })
    try {
      stubLocation(sseOnly.origin, sseOnly.base)
      const client = await getDevframeRpcClient({
        baseURL: `${sseOnly.origin}${sseOnly.base}`,
        otpParam: false,
        simpleAuth: false,
      })
      expect(client.transport).toBe('sse')
      await client.ensureTrusted(5000)
      await expect((client.call as any)('test:probe')).resolves.toBe('ok')
      client.close?.()
    }
    finally {
      await sseOnly.close()
    }
  })

  it('shared state syncs over SSE without echoing server updates back as POSTs', async () => {
    const { devframe, origin, base, close } = await bootServer('sse-client-state')
    try {
      const ctx = await devframe.context
      const serverState = await ctx.rpc.sharedState.get<{ count: number }>('sse-test:counter', {
        initialValue: { count: 1 },
      })

      stubLocation(origin, base)
      let postCount = 0
      const client = await getDevframeRpcClient({
        baseURL: `${origin}${base}`,
        transport: 'sse',
        otpParam: false,
        simpleAuth: false,
        sseOptions: {
          fetch: (input, init) => {
            if (init?.method === 'POST')
              postCount++
            return fetch(input, init)
          },
        },
      })
      await client.ensureTrusted(5000)

      const clientState = await client.sharedState.get<{ count: number }>('sse-test:counter')
      expect(clientState.value().count).toBe(1)

      // Server-side ticks stream down; none of them may reflect back up as
      // a `server-state:set` POST — the echo the server would just discard.
      const postsBeforeTicks = postCount
      serverState.mutate(() => ({ count: 2 }))
      await vi.waitFor(() => expect(clientState.value().count).toBe(2))
      serverState.mutate(() => ({ count: 3 }))
      serverState.mutate(() => ({ count: 4 }))
      await vi.waitFor(() => expect(clientState.value().count).toBe(4))
      expect(postCount).toBe(postsBeforeTicks)

      // A local mutation still forwards to the server (exactly once).
      clientState.mutate(() => ({ count: 5 }))
      await vi.waitFor(() => expect(serverState.value().count).toBe(5))
      expect(postCount).toBe(postsBeforeTicks + 1)
      client.close?.()
    }
    finally {
      await close()
    }
  })

  it('streaming subscriptions deliver over SSE', async () => {
    const { devframe, origin, base, close } = await bootServer('sse-client-stream')
    try {
      const ctx = await devframe.context
      const channel = ctx.rpc.streaming.create<string>('sse-test:tokens', { replayWindow: 16 })
      const sink = channel.start({ id: 'run-1' })
      sink.write('alpha')

      stubLocation(origin, base)
      const client = await getDevframeRpcClient({
        baseURL: `${origin}${base}`,
        transport: 'sse',
        otpParam: false,
        simpleAuth: false,
      })
      await client.ensureTrusted(5000)

      const reader = client.streaming.subscribe<string>('sse-test:tokens', 'run-1')
      const received: string[] = []
      const done = (async () => {
        for await (const chunk of reader) received.push(chunk)
      })()
      await vi.waitFor(() => expect(received).toContain('alpha'))
      sink.write('beta')
      sink.close()
      await done
      expect(received).toEqual(['alpha', 'beta'])
      client.close?.()
    }
    finally {
      await close()
    }
  })
})
