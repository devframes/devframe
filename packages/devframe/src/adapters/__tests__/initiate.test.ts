import type { DevframeNodeContext, DevframeRpcClientFunctions, DevframeRpcServerFunctions } from '../../types'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineDevframe } from 'devframe'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { getPort } from 'get-port-please'
import { describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { getTempAuthCode } from '../../node/auth/state'
import { initDevframe } from '../initiate'

const HANDSHAKE = { authToken: '', ua: 'test', origin: 'http://localhost' }

function connectWsClient(url: string, authToken?: string) {
  return createRpcClient<DevframeRpcServerFunctions, DevframeRpcClientFunctions>(
    {} as DevframeRpcClientFunctions,
    { channel: createWsRpcChannel({ url, authToken }) },
  )
}

function makeTmpDist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'devframe-handler-'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>handler test</title>', 'utf-8')
  return dir
}

function defineTestDef(id: string) {
  return defineDevframe({
    id,
    name: 'Handler Test',
    version: '0.0.0',
    packageName: 'devframe-handler-test',
    homepage: 'https://example.test',
    description: 'Test devframe.',
    setup: (ctx: DevframeNodeContext) => {
      ctx.rpc.register({ name: 'test:probe', type: 'query', handler: () => 'ok' })
    },
  })
}

describe('adapters/handler', () => {
  it('connectionMeta() before ready throws DF0054', () => {
    const devtools = initDevframe(defineTestDef('handler-early'), { base: '/__handler-early/', auth: false })
    expect(() => devtools.connectionMeta()).toThrow(/DF0054|finished initializing/)
    return devtools.close()
  })

  it('pinned side-car tier: SPA, meta, and WS RPC through fetch', async () => {
    const distDir = makeTmpDist()
    const wsPort = await getPort({ port: 18110, host: '127.0.0.1' })
    const devtools = initDevframe(defineTestDef('handler-test'), { base: '/__handler-test/', auth: false, distDir, host: '127.0.0.1', ws: { port: wsPort } })

    try {
      await devtools.ready
      // The advertised meta carries the side-car port with the unified route.
      expect(devtools.connectionMeta()).toEqual({
        backend: 'websocket',
        websocket: { port: wsPort, path: '__ws' },
        sse: { path: '__sse' },
      })

      // Hosted default base: /__<id>/.
      const index = await devtools.handler(new Request('http://localhost:3000/__handler-test/'))
      expect(index.status).toBe(200)
      expect(await index.text()).toContain('handler test')

      const metaRes = await devtools.handler(new Request('http://localhost:3000/__handler-test/__connection.json'))
      expect(metaRes.status).toBe(200)
      expect(await metaRes.json()).toEqual({
        backend: 'websocket',
        websocket: { port: wsPort, path: '__ws' },
        sse: { path: '__sse' },
      })

      // Outside the base — and inside it on a miss — the fetch surface 404s.
      const outside = await devtools.handler(new Request('http://localhost:3000/app'))
      expect(outside.status).toBe(404)

      // RPC round-trips against the side-car.
      const client = connectWsClient(`ws://127.0.0.1:${wsPort}/__ws`)
      await expect(client.$call('test:probe' as any)).resolves.toBe('ok')
      client.$close()
    }
    finally {
      await devtools.close()
    }

    // Teardown is real: the side-car no longer accepts connections.
    const gone = new WebSocket(`ws://127.0.0.1:${wsPort}/__ws`)
    await expect(new Promise((resolve, reject) => {
      gone.on('open', () => reject(new Error('should not connect after close')))
      gone.on('error', () => resolve('closed'))
    })).resolves.toBe('closed')
  })

  it('gates by default: untrusted calls reject until the OTP exchange', async () => {
    const wsPort = await getPort({ port: 18120, host: '127.0.0.1' })
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const devtools = initDevframe(defineTestDef('handler-auth'), { base: '/__handler-auth/', host: '127.0.0.1', ws: { port: wsPort } })

    try {
      await devtools.ready
      // The banner waits for the public origin: unknown until a request
      // arrives, then printed exactly once (the magic link points at the
      // origin the handler is actually mounted on).
      expect(spy).not.toHaveBeenCalled()
      await devtools.handler(new Request('http://localhost:4321/__handler-auth/__connection.json'))
      expect(spy).toHaveBeenCalledTimes(1)
      expect(String(spy.mock.calls[0])).toContain('http://localhost:4321')
      await devtools.handler(new Request('http://localhost:4321/__handler-auth/__connection.json'))
      expect(spy).toHaveBeenCalledTimes(1)

      const client = connectWsClient(`ws://127.0.0.1:${wsPort}/__ws`)
      const handshake = await client.$call('anonymous:devframe:auth' as any, HANDSHAKE)
      expect(handshake).toEqual({ isTrusted: false })
      await expect(client.$call('test:probe' as any)).rejects.toThrow()

      const code = getTempAuthCode()
      const exchange = await client.$call('anonymous:devframe:auth:exchange' as any, { code, ua: 'test', origin: 'http://localhost' }) as { authToken: string | null }
      expect(exchange.authToken).toBeTruthy()
      await expect(client.$call('test:probe' as any)).resolves.toBe('ok')
      client.$close()
    }
    finally {
      spy.mockRestore()
      await devtools.close()
    }
  })

  it('shared-server tier: nodeMiddleware + upgrade at <base>__ws on the host server', async () => {
    const distDir = makeTmpDist()
    const host = '127.0.0.1'
    const port = await getPort({ port: 18130, host })

    let devtoolsRef!: ReturnType<typeof initDevframe>
    const server = createServer((req, res) => {
      // The middleware self-filters by base; everything else stays the
      // host app's.
      devtoolsRef.nodeMiddleware(req, res, () => {
        res.statusCode = 418
        res.end('host app')
      })
    })
    devtoolsRef = initDevframe(defineTestDef('handler-shared'), { base: '/__handler-shared/', auth: false, distDir, server })
    await new Promise<void>(resolve => server.listen(port, host, resolve))

    try {
      await devtoolsRef.ready
      // Zero extra ports: the meta advertises a same-origin relative route,
      // resolved against __connection.json's own URL.
      expect(devtoolsRef.connectionMeta()).toEqual({
        backend: 'websocket',
        websocket: { path: '__ws' },
        sse: { path: '__sse' },
      })

      const index = await fetch(`http://${host}:${port}/__handler-shared/`)
      expect(index.status).toBe(200)
      expect(await index.text()).toContain('handler test')

      const meta = await (await fetch(`http://${host}:${port}/__handler-shared/__connection.json`)).json()
      expect(meta).toEqual({ backend: 'websocket', websocket: { path: '__ws' }, sse: { path: '__sse' } })

      // Outside the base, next() ran and the host app answered.
      const outside = await fetch(`http://${host}:${port}/app`)
      expect(outside.status).toBe(418)
      expect(await outside.text()).toBe('host app')

      // The WS upgrade is bound on the host server at <base>__ws.
      const client = connectWsClient(`ws://${host}:${port}/__handler-shared/__ws`)
      await expect(client.$call('test:probe' as any)).resolves.toBe('ok')
      client.$close()

      // Off-route upgrades are left alone for the host's own sockets to
      // claim (never upgraded by devframe on a shared server).
      const off = new WebSocket(`ws://${host}:${port}/other-socket`)
      const offOpened = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(resolve, 300, false)
        off.on('open', () => {
          clearTimeout(timer)
          resolve(true)
        })
        off.on('error', () => {
          clearTimeout(timer)
          resolve(false)
        })
      })
      off.terminate()
      expect(offOpened).toBe(false)
    }
    finally {
      await devtoolsRef.close()
      // Fire-and-forget teardown for the host-owned test server: the
      // deliberately dangling off-route upgrade socket sits outside the
      // http server's tracked connections, so a graceful close never
      // settles. The handler already detached; the port frees on close.
      server.close()
      server.closeAllConnections()
    }
  })

  it('ws.url tier: advertises the external endpoint verbatim, owns no transport', async () => {
    const devtools = initDevframe(defineTestDef('handler-remote'), { base: '/__handler-remote/', ws: { url: 'wss://devtools.example.com/relay/__ws' } })

    try {
      await devtools.ready
      expect(devtools.connectionMeta()).toEqual({
        backend: 'websocket',
        websocket: 'wss://devtools.example.com/relay/__ws',
      })
    }
    finally {
      await devtools.close()
    }
  })

  it('tunnel pattern: ws.url with a server binds locally, advertises the relay', async () => {
    const host = '127.0.0.1'
    const port = await getPort({ port: 18170, host })
    let devtoolsRef!: ReturnType<typeof initDevframe>
    const server = createServer((req, res) => {
      devtoolsRef.nodeMiddleware(req, res)
    })
    devtoolsRef = initDevframe(defineTestDef('handler-tunnel'), { base: '/__handler-tunnel/', auth: false, server, ws: { url: 'wss://devtools.example.com/relay/__ws' } })
    await new Promise<void>(resolve => server.listen(port, host, resolve))

    try {
      await devtoolsRef.ready
      // The browser is told to dial the relay…
      expect(devtoolsRef.connectionMeta().websocket).toBe('wss://devtools.example.com/relay/__ws')
      // …while the local socket keeps serving (the relay's forward target).
      const client = connectWsClient(`ws://${host}:${port}/__handler-tunnel/__ws`)
      await expect(client.$call('test:probe' as any)).resolves.toBe('ok')
      client.$close()
    }
    finally {
      await devtoolsRef.close()
      server.close()
      server.closeAllConnections()
    }
  })

  it('mcp: mounts <base>__mcp and advertises it in the meta', async () => {
    const wsPort = await getPort({ port: 18140, host: '127.0.0.1' })
    // An explicit origin-only opt-out keeps this loopback-bound fixture free of
    // bearer plumbing; the identity gate itself is covered in mcp-http.test.ts.
    const devtools = initDevframe(defineTestDef('handler-mcp'), { base: '/__handler-mcp/', auth: false, mcp: { authorization: false }, ws: { port: wsPort } })

    try {
      await devtools.ready
      expect(devtools.connectionMeta().mcp).toEqual({ path: '__mcp' })
      // The route is mounted: a bare GET is answered by the MCP transport
      // (405 for a session-less GET), not the 404 an unmounted path gets.
      const res = await devtools.handler(new Request('http://localhost:3000/__handler-mcp/__mcp', {
        headers: { origin: 'http://localhost:3000' },
      }))
      expect(res.status).not.toBe(404)
    }
    finally {
      await devtools.close()
    }
  })

  it('mcp: true without DEVFRAME_MCP_AUTH_TOKEN fails startup (DF0077), route absent', async () => {
    const wsPort = await getPort({ port: 18145, host: '127.0.0.1' })
    const devtools = initDevframe(defineTestDef('handler-mcp-noauth'), { base: '/__handler-mcp-noauth/', auth: false, mcp: true, ws: { port: wsPort } })
    await expect(devtools.ready).rejects.toThrow(/DF0077|authorization policy/)
    await devtools.close()
  })

  it('default tier: binds nothing until the host attaches its own server', async () => {
    const host = '127.0.0.1'
    const port = await getPort({ port: 18150, host })
    // No `server`, no `ws` — the instance owns no transport of its own.
    const devtools = initDevframe(defineTestDef('handler-attach'), { base: '/__handler-attach/', auth: false })
    const server = createServer((req, res) => devtools.nodeMiddleware(req, res))
    let detach: (() => void) | undefined

    try {
      await devtools.ready
      // Advertised as a same-origin route, with no port of its own.
      expect(devtools.connectionMeta()).toEqual({
        backend: 'websocket',
        websocket: { path: '__ws' },
        sse: { path: '__sse' },
      })

      // Upgrades only reach the socket once the host hands them over.
      await new Promise<void>(resolve => server.listen(port, host, resolve))
      const before = new WebSocket(`ws://${host}:${port}/__handler-attach/__ws`)
      await expect(new Promise((resolve, reject) => {
        before.on('open', () => reject(new Error('socket served before attach')))
        before.on('error', () => resolve('refused'))
      })).resolves.toBe('refused')

      detach = devtools.attach(server)
      const client = connectWsClient(`ws://${host}:${port}/__handler-attach/__ws`)
      await expect(client.$call('test:probe' as any)).resolves.toBe('ok')
      client.$close()

      // Detaching hands the upgrade route back to the host.
      detach()
      detach = undefined
      const after = new WebSocket(`ws://${host}:${port}/__handler-attach/__ws`)
      await expect(new Promise((resolve, reject) => {
        after.on('open', () => reject(new Error('socket still served after detach')))
        after.on('error', () => resolve('refused'))
      })).resolves.toBe('refused')
    }
    finally {
      detach?.()
      await devtools.close()
      server.close()
      server.closeAllConnections()
    }
  })

  it('ws.sidecar: an auto-port side-car, advertised with its resolved port', async () => {
    const devtools = initDevframe(defineTestDef('handler-sidecar'), {
      base: '/__handler-sidecar/',
      auth: false,
      host: '127.0.0.1',
      ws: { sidecar: true },
    })

    try {
      await devtools.ready
      const meta = devtools.connectionMeta()
      const advertised = meta.websocket as { port: number, path: string }
      expect(advertised.path).toBe('__ws')
      expect(advertised.port).toBeGreaterThan(0)

      const client = connectWsClient(`ws://127.0.0.1:${advertised.port}/__ws`)
      await expect(client.$call('test:probe' as any)).resolves.toBe('ok')
      client.$close()
    }
    finally {
      await devtools.close()
    }
  })

  it('a configured transport refuses to take over the host upgrades', async () => {
    const wsPort = await getPort({ port: 18155, host: '127.0.0.1' })
    const sidecar = initDevframe(defineTestDef('handler-owned'), { base: '/__handler-owned/', auth: false, host: '127.0.0.1', ws: { port: wsPort } })
    const external = initDevframe(defineTestDef('handler-external'), { base: '/__handler-external/', ws: { url: 'wss://devtools.example.com/relay/__ws' } })

    try {
      await Promise.all([sidecar.ready, external.ready])
      const server = createServer()
      // The side-car already serves the socket…
      expect(() => sidecar.attach(server)).toThrow(/DF0055|already owns its WebSocket transport/)
      // …and an external endpoint owns both transport and auth.
      expect(() => external.attach(server)).toThrow(/DF0056|advertises an external WebSocket endpoint/)
    }
    finally {
      await sidecar.close()
      await external.close()
    }
  })

  // The auth-link origin is derived from the served request's URL (the fetch
  // handler ignores the `Host` header — that path is `nodeMiddleware`'s), so
  // each case just points a request at the origin under test and inspects the
  // one-time banner (`console.log`).
  async function withBannerSpy(
    id: string,
    extra: Partial<Parameters<typeof initDevframe>[1]>,
    run: (devtools: ReturnType<typeof initDevframe>, spy: ReturnType<typeof vi.spyOn>) => Promise<void>,
  ): Promise<void> {
    const wsPort = await getPort({ host: '127.0.0.1' })
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const devtools = initDevframe(defineTestDef(id), { base: `/__${id}/`, host: '127.0.0.1', ws: { port: wsPort }, ...extra })
    try {
      await devtools.ready
      await run(devtools, spy)
    }
    finally {
      spy.mockRestore()
      await devtools.close()
    }
  }
  const hit = (devtools: ReturnType<typeof initDevframe>, origin: string): Promise<Response> =>
    devtools.handler(new Request(`${origin}/__connection.json`))

  it('a hostile first request never becomes the OTP-link origin; a later loopback one does', () =>
    withBannerSpy('h-poison', {}, async (devtools, spy) => {
      // A forged non-loopback origin is not adopted and prints nothing.
      await hit(devtools, 'http://evil.example.com/__h-poison')
      expect(spy).not.toHaveBeenCalled()
      // A later loopback origin is adopted and prints exactly one OTP link
      // (the credential rides the fragment) — the reject never locked it out.
      await hit(devtools, 'http://localhost:4321/__h-poison')
      expect(spy).toHaveBeenCalledTimes(1)
      expect(String(spy.mock.calls[0])).toContain('http://localhost:4321/#devframe_otp=')
      expect(String(spy.mock.calls[0])).not.toContain('evil.example.com')
      // First-valid origin is pinned: a second loopback request doesn't move it.
      await hit(devtools, 'http://127.0.0.1:9999/__h-poison')
      expect(spy).toHaveBeenCalledTimes(1)
    }))

  it('adopts an exactly allow-listed non-loopback origin, but rejects a near-match', () =>
    withBannerSpy('h-allow', { allowedOrigins: ['https://tools.example.com'] }, async (devtools, spy) => {
      // Prefix/suffix near-matches of the allow-list entry are never adopted.
      await hit(devtools, 'https://tools.example.com.evil.com/__h-allow')
      await hit(devtools, 'https://evil.tools.example.com/__h-allow')
      expect(spy).not.toHaveBeenCalled()
      // The exact allow-listed origin is.
      await hit(devtools, 'https://tools.example.com/__h-allow')
      expect(spy).toHaveBeenCalledTimes(1)
      expect(String(spy.mock.calls[0])).toContain('https://tools.example.com/#')
    }))

  it('an explicit origin wins over any request', () =>
    withBannerSpy('h-pinned', { origin: 'https://pinned.example.com' }, async (devtools, spy) => {
      // Pinned: the banner points at it before any request, and a forged
      // request can't move it.
      expect(spy).toHaveBeenCalledTimes(1)
      expect(String(spy.mock.calls[0])).toContain('https://pinned.example.com/#')
      await hit(devtools, 'http://evil.example.com/__h-pinned')
      expect(spy).toHaveBeenCalledTimes(1)
      expect(String(spy.mock.calls[0])).not.toContain('evil.example.com')
    }))

  it('canonicalizes an adopted origin, dropping the default port', () =>
    withBannerSpy('h-canon', {}, async (devtools, spy) => {
      await hit(devtools, 'http://localhost:80/__h-canon')
      expect(spy).toHaveBeenCalledTimes(1)
      expect(String(spy.mock.calls[0])).toContain('http://localhost/#')
      expect(String(spy.mock.calls[0])).not.toContain('localhost:80')
    }))

  it('bridge mode: without a distDir only meta + WS are served', async () => {
    const wsPort = await getPort({ port: 18160, host: '127.0.0.1' })
    const devtools = initDevframe(defineTestDef('handler-bridge'), { base: '/__handler-bridge/', auth: false, ws: { port: wsPort } })

    try {
      await devtools.ready
      const meta = await devtools.handler(new Request('http://localhost:3000/__handler-bridge/__connection.json'))
      expect(meta.status).toBe(200)
      // No SPA mount: the base itself is a miss, normalized to a bare 404.
      const spa = await devtools.handler(new Request('http://localhost:3000/__handler-bridge/'))
      expect(spa.status).toBe(404)
      expect(await spa.text()).toBe('')
    }
    finally {
      await devtools.close()
    }
  })
})
