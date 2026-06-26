import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getPort } from 'get-port-please'
import { describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { defineDevframe } from '../../types/devframe'
import { createDevServer, resolveDevServerPort } from '../dev'

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
      expect(handle.origin).toBe(`http://${host}:${port}`)

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
