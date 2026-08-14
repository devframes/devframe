import type { DevframeDefinition, DevframeNodeContext, DevframeRpcClientFunctions, DevframeRpcServerFunctions } from 'devframe/types'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { getPort } from 'get-port-please'
import { describe, expect, it } from 'vitest'
import { DEVFRAMES_HUB_BASE, initHub } from '../initiate'

function makeDist(html: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'hub-initiate-'))
  writeFileSync(join(dir, 'index.html'), html, 'utf-8')
  return dir
}

function makeFrame(id: string, distDir?: string): DevframeDefinition {
  return {
    id,
    name: `Frame ${id}`,
    version: '0.0.0',
    packageName: `@test/${id}`,
    homepage: '',
    description: '',
    ...(distDir ? { cli: { distDir } } : {}),
    setup(ctx: DevframeNodeContext) {
      ctx.rpc.register({ name: `${id}:probe`, type: 'query', handler: () => `ok:${id}` })
      ctx.agent.registerTool({
        id: `${id}-tool`,
        description: `Tool from ${id}.`,
        safety: 'read',
        handler: () => ({ from: id }),
      })
    },
  }
}

function connectWsClient(url: string) {
  return createRpcClient<DevframeRpcServerFunctions, DevframeRpcClientFunctions>(
    {} as DevframeRpcClientFunctions,
    { channel: createWsRpcChannel({ url }) },
  )
}

describe('initHub', () => {
  it('connectionMeta() before ready throws DF8003', () => {
    const hub = initHub({ base: DEVFRAMES_HUB_BASE, auth: false })
    expect(() => hub.connectionMeta()).toThrow(/DF8003|finished initializing/)
    return hub.close()
  })

  it('rejects a devframe id that shadows a reserved hub path', async () => {
    const hub = initHub({ base: DEVFRAMES_HUB_BASE, auth: false, devframes: [makeFrame('__mcp')] })
    await expect(hub.ready).rejects.toThrow(/DF8000|reserved hub path/)
    await hub.close()
  })

  it('rejects devframes together with a pre-built context', async () => {
    const hub = initHub({ base: DEVFRAMES_HUB_BASE, auth: false })
    await hub.ready
    const ctx = await hub.context
    const conflicting = initHub({ base: DEVFRAMES_HUB_BASE, auth: false, context: ctx, devframes: [makeFrame('git')] })
    await expect(conflicting.ready).rejects.toThrow(/DF8002|mutually exclusive/)
    await conflicting.close()
    await hub.close()
  })

  it('shared-server tier: one namespace serves frames, discovery, and one shared socket', async () => {
    const host = '127.0.0.1'
    const port = await getPort({ port: 18210, host })
    const distA = makeDist('<!doctype html><title>frame a</title>')
    const distB = makeDist('<!doctype html><title>frame b</title>')

    let hubRef!: ReturnType<typeof initHub>
    const server = createServer((req, res) => {
      hubRef.nodeMiddleware(req, res, () => {
        res.statusCode = 418
        res.end('host app')
      })
    })
    hubRef = initHub({ base: DEVFRAMES_HUB_BASE, auth: false, server, devframes: [makeFrame('alpha', distA), makeFrame('beta', distB)] })
    await new Promise<void>(resolve => server.listen(port, host, resolve))

    try {
      await hubRef.ready
      // One shared socket, advertised hub-base-absolute so the same meta
      // resolves correctly from the hub base and from every frame base.
      expect(hubRef.connectionMeta()).toEqual({
        backend: 'websocket',
        websocket: { path: '/__devframes/__ws' },
        sse: { path: '/__devframes/__sse' },
      })

      // Frame SPAs under <base><id>/.
      const alpha = await fetch(`http://${host}:${port}/__devframes/alpha/`)
      expect(await alpha.text()).toContain('frame a')
      const beta = await fetch(`http://${host}:${port}/__devframes/beta/`)
      expect(await beta.text()).toContain('frame b')

      // Per-frame discovery points at the shared hub socket.
      const frameMeta = await (await fetch(`http://${host}:${port}/__devframes/alpha/__connection.json`)).json()
      expect(frameMeta.websocket).toEqual({ path: '/__devframes/__ws' })

      // The index document names every frame; the headless root serves it too.
      const index = await (await fetch(`http://${host}:${port}/__devframes/__index.json`)).json()
      expect(index.frames.map((f: { id: string }) => f.id)).toEqual(['alpha', 'beta'])
      const root = await (await fetch(`http://${host}:${port}/__devframes/`)).json()
      expect(root.frames.length).toBe(2)

      // No ui slot → embedded.js is a reserved 404.
      const embedded = await fetch(`http://${host}:${port}/__devframes/embedded.js`)
      expect(embedded.status).toBe(404)

      // The client-imports module is served as an ES module.
      const imports = await fetch(`http://${host}:${port}/__devframes/__client-imports.js`)
      expect(imports.headers.get('content-type')).toContain('javascript')
      expect(await imports.text()).toContain('export const clientImports')

      // Outside the namespace stays the host app's.
      const outside = await fetch(`http://${host}:${port}/app`)
      expect(outside.status).toBe(418)

      // Cross-frame RPC: one merged registry on the one shared socket.
      const client = connectWsClient(`ws://${host}:${port}/__devframes/__ws`)
      await expect(client.$call('alpha:probe' as any)).resolves.toBe('ok:alpha')
      await expect(client.$call('beta:probe' as any)).resolves.toBe('ok:beta')
      client.$close()
    }
    finally {
      await hubRef.close()
      server.close()
      server.closeAllConnections()
    }
  })

  it('ui slot: viewer owns the root, embedded.js serves the entry, discovery still wins', async () => {
    const viewerDist = makeDist('<!doctype html><title>hub viewer</title>')
    const embeddedDir = mkdtempSync(join(tmpdir(), 'hub-embedded-'))
    const embeddedEntry = join(embeddedDir, 'embedded.js')
    writeFileSync(embeddedEntry, 'console.log("embedded bootstrap")', 'utf-8')
    const wsPort = await getPort({ port: 18220, host: '127.0.0.1' })

    const hub = initHub({ base: DEVFRAMES_HUB_BASE, auth: false, host: '127.0.0.1', ws: { port: wsPort }, devframes: [makeFrame('alpha', makeDist('<!doctype html><title>frame a</title>'))], ui: {
      viewer: { distDir: viewerDist },
      embedded: { entry: embeddedEntry },
    } })

    try {
      await hub.ready
      const origin = 'http://localhost:5173'

      // The viewer SPA owns the namespace root…
      const root = await hub.handler(new Request(`${origin}/__devframes/`))
      expect(await root.text()).toContain('hub viewer')

      // …while exact protocol endpoints still win over its SPA fallback.
      const index = await hub.handler(new Request(`${origin}/__devframes/__index.json`))
      expect((await index.json()).endpoints.embedded).toBe('embedded.js')
      const meta = await hub.handler(new Request(`${origin}/__devframes/__connection.json`))
      expect((await meta.json()).websocket).toEqual({ port: wsPort, path: '__ws' })

      // The embedded bootstrap serves from the ui slot.
      const embedded = await hub.handler(new Request(`${origin}/__devframes/embedded.js`))
      expect(embedded.headers.get('content-type')).toContain('javascript')
      expect(await embedded.text()).toContain('embedded bootstrap')

      // Frames still mount beneath the viewer's base.
      const alpha = await hub.handler(new Request(`${origin}/__devframes/alpha/`))
      expect(await alpha.text()).toContain('frame a')
    }
    finally {
      await hub.close()
    }
  })

  it('assembles ConnectionMeta.configs from the ui slot and every installed devframe\'s dock preferences', async () => {
    const wsPort = await getPort({ port: 18225, host: '127.0.0.1' })
    const alpha: DevframeDefinition = {
      ...makeFrame('alpha', makeDist('<!doctype html><title>frame a</title>')),
      dock: { category: 'app' },
      dockPreferences: { categoryOrder: { app: -40 }, maxVisibleItems: 4 },
    }
    const beta: DevframeDefinition = {
      ...makeFrame('beta'),
      dock: { category: 'web' },
      dockPreferences: { categoryOrder: { app: -60, web: 300 }, defaultMode: 'edge' },
    }

    const hub = initHub({
      base: DEVFRAMES_HUB_BASE,
      auth: false,
      host: '127.0.0.1',
      ws: { port: wsPort },
      devframes: [alpha, beta],
      ui: { configs: () => ({ branding: { productName: 'Test Hub' } }) },
    })

    try {
      await hub.ready
      const origin = 'http://localhost:5173'

      // The hub's own meta…
      const hubMeta = await (await hub.handler(new Request(`${origin}/__devframes/__connection.json`))).json()
      expect(hubMeta.configs).toEqual({
        ui: { branding: { productName: 'Test Hub' } },
        // Last-installed devframe (`beta`) wins the `app` scalar key; `web`
        // only `beta` declared; `maxVisibleItems` only `alpha` declared.
        dock: { categoryOrder: { app: -60, web: 300 }, maxVisibleItems: 4, defaultMode: 'edge' },
      })

      // …and every per-frame meta carries the identical aggregate.
      const frameMeta = await (await hub.handler(new Request(`${origin}/__devframes/alpha/__connection.json`))).json()
      expect(frameMeta.configs).toEqual(hubMeta.configs)
    }
    finally {
      await hub.close()
    }
  })

  it('omits ConnectionMeta.configs entirely when neither the ui slot nor any devframe declares anything', async () => {
    const wsPort = await getPort({ port: 18226, host: '127.0.0.1' })
    const hub = initHub({ base: DEVFRAMES_HUB_BASE, auth: false, host: '127.0.0.1', ws: { port: wsPort }, devframes: [makeFrame('alpha')] })

    try {
      await hub.ready
      const meta = await (await hub.handler(new Request(`http://localhost:5173/__devframes/__connection.json`))).json()
      expect(meta.configs).toBeUndefined()
    }
    finally {
      await hub.close()
    }
  })

  it('aggregate MCP: one endpoint lists tools from every mounted frame', async () => {
    const wsPort = await getPort({ port: 18230, host: '127.0.0.1' })
    const hub = initHub({ base: DEVFRAMES_HUB_BASE, auth: false, host: '127.0.0.1', ws: { port: wsPort }, mcp: true, devframes: [makeFrame('alpha'), makeFrame('beta')] })

    try {
      await hub.ready
      expect(hub.connectionMeta().mcp).toEqual({ path: '__mcp' })

      const origin = 'http://localhost:3000'
      const init = await hub.handler(new Request(`${origin}/__devframes/__mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json, text/event-stream',
          origin,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'x', version: '0' } },
        }),
      }))
      expect(init.status).toBe(200)
      const sessionId = init.headers.get('mcp-session-id')
      expect(sessionId).toBeTruthy()
      await init.body?.cancel()

      const initialized = await hub.handler(new Request(`${origin}/__devframes/__mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json, text/event-stream',
          'mcp-session-id': sessionId!,
          origin,
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      }))
      await initialized.body?.cancel()

      const list = await hub.handler(new Request(`${origin}/__devframes/__mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json, text/event-stream',
          'mcp-session-id': sessionId!,
          origin,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      }))
      expect(list.status).toBe(200)
      const raw = await list.text()
      // Tools from both frames surface through the one aggregate endpoint.
      expect(raw).toContain('alpha-tool')
      expect(raw).toContain('beta-tool')
    }
    finally {
      await hub.close()
    }
  })

  it('single hub Auth: one gate covers every frame on the shared socket', async () => {
    const wsPort = await getPort({ port: 18240, host: '127.0.0.1' })
    const hub = initHub({ base: DEVFRAMES_HUB_BASE, host: '127.0.0.1', ws: { port: wsPort }, devframes: [makeFrame('alpha')] })

    try {
      await hub.ready
      const client = connectWsClient(`ws://127.0.0.1:${wsPort}/__ws`)
      const handshake = await client.$call('anonymous:devframe:auth' as any, { authToken: '', ua: 'test', origin: 'http://localhost' }) as { isTrusted: boolean }
      expect(handshake.isTrusted).toBe(false)
      // Untrusted callers reach neither frame functions nor hub built-ins.
      await expect(client.$call('alpha:probe' as any)).rejects.toThrow()
      client.$close()
    }
    finally {
      await hub.close()
    }
  })

  it('default tier: binds nothing until the host attaches its own server', async () => {
    const host = '127.0.0.1'
    const port = await getPort({ port: 18250, host })
    // No `server`, no `ws` — the hub serves its namespace and waits for the
    // host to hand the upgrade route over.
    const hub = initHub({ base: DEVFRAMES_HUB_BASE, auth: false, devframes: [makeFrame('alpha')] })
    const server = createServer((req, res) => hub.nodeMiddleware(req, res))
    let detach: (() => void) | undefined

    try {
      await hub.ready
      expect(hub.connectionMeta()).toEqual({
        backend: 'websocket',
        websocket: { path: '/__devframes/__ws' },
        sse: { path: '/__devframes/__sse' },
      })

      await new Promise<void>(resolve => server.listen(port, host, resolve))
      detach = hub.attach(server)
      const client = connectWsClient(`ws://${host}:${port}/__devframes/__ws`)
      await expect(client.$call('alpha:probe' as any)).resolves.toBe('ok:alpha')
      client.$close()
    }
    finally {
      detach?.()
      await hub.close()
      server.close()
      server.closeAllConnections()
    }
  })

  it('ws.sidecar: an auto-port side-car, advertised with its resolved port', async () => {
    const hub = initHub({ base: DEVFRAMES_HUB_BASE, auth: false, host: '127.0.0.1', ws: { sidecar: true }, devframes: [makeFrame('alpha')] })

    try {
      await hub.ready
      const advertised = hub.connectionMeta().websocket as { port: number, path: string }
      expect(advertised.path).toBe('__ws')
      expect(advertised.port).toBeGreaterThan(0)

      const client = connectWsClient(`ws://127.0.0.1:${advertised.port}/__ws`)
      await expect(client.$call('alpha:probe' as any)).resolves.toBe('ok:alpha')
      client.$close()
    }
    finally {
      await hub.close()
    }
  })
})
