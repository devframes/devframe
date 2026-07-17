import type { DevframeNodeContext, DevframeRpcClientFunctions, DevframeRpcServerFunctions } from '../../types'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { getPort } from 'get-port-please'
import { describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { getTempAuthCode } from '../../node/auth/state'
import { defineDevframe } from '../../types/devframe'
import { createDevServer, resolveDevServerPort } from '../dev'

function connectWsClient(host: string, port: number, authToken?: string) {
  return createRpcClient<DevframeRpcServerFunctions, DevframeRpcClientFunctions>(
    {} as DevframeRpcClientFunctions,
    { channel: createWsRpcChannel({ url: `ws://${host}:${port}/__devframe_ws`, authToken }) },
  )
}

const HANDSHAKE = { authToken: '', ua: 'test', origin: 'http://localhost' }

function makeTmpDist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'devframe-dev-'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>test</title>', 'utf-8')
  return dir
}

describe('adapters/dev', () => {
  it('createDevServer starts, exposes __connection.json, and closes', async () => {
    const distDir = makeTmpDist()
    const devframe = defineDevframe({
      id: 'devframe-test',
      name: 'Devframe Test',
      version: '0.0.0',
      packageName: 'devframe-test',
      homepage: 'https://example.test',
      description: 'Test devframe.',
      setup: () => {},
    })

    const host = '127.0.0.1'
    const port = await getPort({ port: 19999, host })
    const handle = await createDevServer(devframe, {
      host,
      port,
      distDir,
      openBrowser: false,
    })

    try {
      expect(handle.port).toBe(port)
      // The advertised origin is dialable: the loopback IP normalizes to
      // `localhost` so a client can actually open it.
      expect(handle.origin).toBe(`http://localhost:${port}`)

      const res = await fetch(`http://${host}:${port}/__connection.json`)
      expect(res.ok).toBe(true)
      const meta = await res.json()
      // Proxy-safe: the WS endpoint is advertised as a same-origin route
      // relative to `__connection.json`, never a baked-in host/port.
      expect(meta).toEqual({ backend: 'websocket', websocket: { path: '__devframe_ws' } })
    }
    finally {
      await handle.close()
    }
  })

  it('advertises a dialable origin when bound to the wildcard host', async () => {
    const distDir = makeTmpDist()
    const devframe = defineDevframe({
      id: 'devframe-test-wildcard',
      name: 'Wildcard Host',
      version: '0.0.0',
      packageName: 'devframe-test',
      homepage: 'https://example.test',
      description: 'Test devframe.',
      setup: () => {},
    })

    // Binding to `0.0.0.0` listens on every interface, but that address isn't
    // dialable from a browser — the advertised origin must fall back to a
    // loopback host so the page (and its same-origin WS) actually connect.
    const host = '0.0.0.0'
    const port = await getPort({ port: 19795, host })
    const handle = await createDevServer(devframe, {
      host,
      port,
      distDir,
      openBrowser: false,
    })

    try {
      expect(handle.origin).toBe(`http://localhost:${port}`)
      // The socket still listens on the wildcard host, reachable via loopback.
      const res = await fetch(`http://localhost:${port}/__connection.json`)
      expect(res.ok).toBe(true)
    }
    finally {
      await handle.close()
    }
  })

  it('createDevServer binds the WS endpoint to the advertised route', async () => {
    const distDir = makeTmpDist()
    const devframe = defineDevframe({
      id: 'devframe-test-ws',
      name: 'Devframe WS',
      version: '0.0.0',
      packageName: 'devframe-test',
      homepage: 'https://example.test',
      description: 'Test devframe.',
      setup: () => {},
    })

    const host = '127.0.0.1'
    const port = await getPort({ port: 19899, host })
    const handle = await createDevServer(devframe, {
      host,
      port,
      distDir,
      openBrowser: false,
    })

    try {
      // Connects on the bound route.
      const ok = new WebSocket(`ws://${host}:${port}/__devframe_ws`)
      await expect(new Promise((resolve, reject) => {
        ok.on('open', () => resolve('open'))
        ok.on('error', reject)
      })).resolves.toBe('open')
      ok.close()

      // A connection off-route is left unhandled (no upgrade handler claims
      // it) and the socket is closed without an open event.
      const off = new WebSocket(`ws://${host}:${port}/not-the-ws-route`)
      await expect(new Promise((resolve, reject) => {
        off.on('open', () => reject(new Error('should not open off-route')))
        off.on('close', () => resolve('closed'))
        off.on('error', () => resolve('closed'))
      })).resolves.toBe('closed')
    }
    finally {
      await handle.close()
    }
  })

  it('ws config: custom route on the same server', async () => {
    const devframe = defineDevframe({
      id: 'devframe-ws-route',
      name: 'WS Route',
      version: '0.0.0',
      packageName: 'devframe-test',
      homepage: 'https://example.test',
      description: 'Test devframe.',
      setup: () => {},
      cli: { ws: { route: '__sockets' } },
    })
    const host = '127.0.0.1'
    const port = await getPort({ port: 19880, host })
    const handle = await createDevServer(devframe, { host, port, openBrowser: false })

    try {
      const meta = await (await fetch(`http://${host}:${port}/__connection.json`)).json()
      expect(meta).toEqual({ backend: 'websocket', websocket: { path: '__sockets' } })

      const ok = new WebSocket(`ws://${host}:${port}/__sockets`)
      await expect(new Promise((resolve, reject) => {
        ok.on('open', () => resolve('open'))
        ok.on('error', reject)
      })).resolves.toBe('open')
      ok.close()
    }
    finally {
      await handle.close()
    }
  })

  it('ws config: dedicated port binds a separate socket server', async () => {
    const devframe = defineDevframe({
      id: 'devframe-ws-port',
      name: 'WS Port',
      version: '0.0.0',
      packageName: 'devframe-test',
      homepage: 'https://example.test',
      description: 'Test devframe.',
      setup: () => {},
    })
    const host = '127.0.0.1'
    const port = await getPort({ port: 19870, host })
    const wsPort = await getPort({ port: 19871, host })
    const handle = await createDevServer(devframe, {
      host,
      port,
      openBrowser: false,
      ws: { port: wsPort },
    })

    try {
      const meta = await (await fetch(`http://${host}:${port}/__connection.json`)).json()
      expect(meta).toEqual({
        backend: 'websocket',
        websocket: { port: wsPort, path: '__devframe_ws' },
      })

      // The socket is reachable on its own port, rooted at `/<route>`.
      const ok = new WebSocket(`ws://${host}:${wsPort}/__devframe_ws`)
      await expect(new Promise((resolve, reject) => {
        ok.on('open', () => resolve('open'))
        ok.on('error', reject)
      })).resolves.toBe('open')
      ok.close()

      // Nothing on the HTTP port handles upgrades in this mode.
      const httpAddr = handle.port
      expect(httpAddr).toBe(port)
    }
    finally {
      await handle.close()
    }
  })

  it('ws config: remote url is advertised verbatim', async () => {
    const devframe = defineDevframe({
      id: 'devframe-ws-remote',
      name: 'WS Remote',
      version: '0.0.0',
      packageName: 'devframe-test',
      homepage: 'https://example.test',
      description: 'Test devframe.',
      setup: () => {},
      cli: { ws: { url: 'wss://devtools.example.com/relay/__devframe_ws' } },
    })
    const host = '127.0.0.1'
    const port = await getPort({ port: 19860, host })
    const handle = await createDevServer(devframe, { host, port, openBrowser: false })

    try {
      const meta = await (await fetch(`http://${host}:${port}/__connection.json`)).json()
      expect(meta).toEqual({
        backend: 'websocket',
        websocket: 'wss://devtools.example.com/relay/__devframe_ws',
      })
    }
    finally {
      await handle.close()
    }
  })

  it('createDevServer runs in bridge mode when no distDir is configured', async () => {
    const devframe = defineDevframe({
      id: 'devframe-test-nodist',
      name: 'No Dist',
      version: '0.0.0',
      packageName: 'devframe-test',
      homepage: 'https://example.test',
      description: 'Test devframe.',
      setup: () => {},
    })
    const host = '127.0.0.1'
    const port = await getPort({ port: 19990, host })
    const handle = await createDevServer(devframe, {
      host,
      port,
      openBrowser: false,
    })

    try {
      // Connection meta is still served — the bridge endpoint that lets
      // a host-served SPA discover the WS backend.
      const res = await fetch(`http://${host}:${port}/__connection.json`)
      expect(res.ok).toBe(true)
      const meta = await res.json()
      expect(meta).toEqual({ backend: 'websocket', websocket: { path: '__devframe_ws' } })

      // The SPA mount is absent — without a distDir, no static handler
      // is wired, so the basePath returns a 404 from h3 instead of an
      // index.html.
      const spa = await fetch(`http://${host}:${port}/`)
      expect(spa.status).toBe(404)
    }
    finally {
      await handle.close()
    }
  })

  it('gates by default: an unset `auth` auto-wires the interactive OTP handler', async () => {
    const devframe = defineDevframe({
      id: 'devframe-auth-default',
      name: 'Auth Default',
      version: '0.0.0',
      packageName: 'devframe-test',
      homepage: 'https://example.test',
      description: 'Test devframe.',
      setup: (ctx: DevframeNodeContext) => {
        ctx.rpc.register({ name: 'test:probe', type: 'query', handler: () => 'ok' })
      },
    })
    const host = '127.0.0.1'
    const port = await getPort({ port: 19410, host })
    // No `banner` override is exposed through the adapter, so silence the
    // default stdout banner for the test run.
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handle = await createDevServer(devframe, { host, port, openBrowser: false })

    try {
      const client = connectWsClient(host, port)
      // Untrusted: only `anonymous:` methods are reachable; the probe rejects.
      const handshake = await client.$call('anonymous:devframe:auth' as any, HANDSHAKE)
      expect(handshake).toEqual({ isTrusted: false })
      await expect(client.$call('test:probe' as any)).rejects.toThrow()

      // The interactive exchange method is wired — the printed code trusts.
      const code = getTempAuthCode()
      const exchange = await client.$call('anonymous:devframe:auth:exchange' as any, { code, ua: 'test', origin: 'http://localhost' }) as { authToken: string | null }
      expect(exchange.authToken).toBeTruthy()
      await expect(client.$call('test:probe' as any)).resolves.toBe('ok')
      client.$close()
    }
    finally {
      spy.mockRestore()
      await handle.close()
    }
  })

  it('opts out with `auth: false`: the server auto-trusts and skips the gate', async () => {
    const devframe = defineDevframe({
      id: 'devframe-auth-off',
      name: 'Auth Off',
      version: '0.0.0',
      packageName: 'devframe-test',
      homepage: 'https://example.test',
      description: 'Test devframe.',
      cli: { auth: false },
      setup: (ctx: DevframeNodeContext) => {
        ctx.rpc.register({ name: 'test:probe', type: 'query', handler: () => 'ok' })
      },
    })
    const host = '127.0.0.1'
    const port = await getPort({ port: 19420, host })
    const handle = await createDevServer(devframe, { host, port, openBrowser: false })

    try {
      const client = connectWsClient(host, port)
      const handshake = await client.$call('anonymous:devframe:auth' as any, HANDSHAKE)
      expect(handshake).toEqual({ isTrusted: true })
      // Ungated: the probe resolves without any code exchange.
      await expect(client.$call('test:probe' as any)).resolves.toBe('ok')
      client.$close()
    }
    finally {
      await handle.close()
    }
  })

  it('the `--no-auth` flag (flags.auth === false) opts out of the gate', async () => {
    const devframe = defineDevframe({
      id: 'devframe-auth-flag',
      name: 'Auth Flag',
      version: '0.0.0',
      packageName: 'devframe-test',
      homepage: 'https://example.test',
      description: 'Test devframe.',
      setup: (ctx: DevframeNodeContext) => {
        ctx.rpc.register({ name: 'test:probe', type: 'query', handler: () => 'ok' })
      },
    })
    const host = '127.0.0.1'
    const port = await getPort({ port: 19430, host })
    const handle = await createDevServer(devframe, { host, port, openBrowser: false, flags: { auth: false } })

    try {
      const client = connectWsClient(host, port)
      const handshake = await client.$call('anonymous:devframe:auth' as any, HANDSHAKE)
      expect(handshake).toEqual({ isTrusted: true })
      await expect(client.$call('test:probe' as any)).resolves.toBe('ok')
      client.$close()
    }
    finally {
      await handle.close()
    }
  })

  it('resolveDevServerPort honors def.cli.port as the preferred default', async () => {
    const preferred = await getPort({ port: 19500, host: '127.0.0.1' })
    const devframe = defineDevframe({
      id: 'devframe-test-port',
      name: 'Port Test',
      version: '0.0.0',
      packageName: 'devframe-test',
      homepage: 'https://example.test',
      description: 'Test devframe.',
      setup: () => {},
      cli: { port: preferred },
    })
    const port = await resolveDevServerPort(devframe, { host: '127.0.0.1' })
    expect(port).toBe(preferred)
  })

  it('resolveDevServerPort: defaultPort overrides def.cli.port', async () => {
    const override = await getPort({ port: 19600, host: '127.0.0.1' })
    const devframe = defineDevframe({
      id: 'devframe-test-port-override',
      name: 'Port Override',
      version: '0.0.0',
      packageName: 'devframe-test',
      homepage: 'https://example.test',
      description: 'Test devframe.',
      setup: () => {},
      cli: { port: 9999 },
    })
    const port = await resolveDevServerPort(devframe, {
      host: '127.0.0.1',
      defaultPort: override,
    })
    expect(port).toBe(override)
  })
})
