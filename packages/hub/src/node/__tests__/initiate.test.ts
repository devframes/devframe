import type { DevframeDefinition, DevframeNodeContext, DevframeRpcClientFunctions, DevframeRpcServerFunctions } from 'devframe/types'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { getPort } from 'get-port-please'
import { describe, expect, it, vi } from 'vitest'
import { DOCK_RENDERERS_STATE_KEY } from '../../constants'
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
    ...(distDir ? { clientAssets: distDir } : {}),
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
  it('publishes an empty renderer manifest when no renderers are registered', async () => {
    expect.assertions(2)
    const hub = initHub({ base: DEVFRAMES_HUB_BASE, auth: false })

    try {
      await hub.ready
      const context = await hub.context
      expect(context.rpc.sharedState.keys()).toContain(DOCK_RENDERERS_STATE_KEY)

      const rendererManifest = await context.rpc.sharedState.get(DOCK_RENDERERS_STATE_KEY)
      expect(rendererManifest.value()).toEqual({})
    }
    finally {
      await hub.close()
    }
  })

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
      // resolves correctly from the hub base and from every frame base. The
      // frames register agent tools, so the `'auto'` default also mounts
      // the aggregate MCP route.
      expect(hubRef.connectionMeta()).toEqual({
        backend: 'websocket',
        websocket: { path: '/__devframes/__ws' },
        sse: { path: '/__devframes/__sse' },
        mcp: { path: '__mcp' },
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

  it('serves whatever the ui slot\'s setup(ctx) writes to ctx.staticConfig as ConnectionMeta.configs', async () => {
    const wsPort = await getPort({ port: 18225, host: '127.0.0.1' })
    const alpha = makeFrame('alpha', makeDist('<!doctype html><title>frame a</title>'))

    const hub = initHub({
      base: DEVFRAMES_HUB_BASE,
      auth: false,
      host: '127.0.0.1',
      ws: { port: wsPort },
      devframes: [alpha],
      ui: {
        setup(ctx) {
          ;(ctx.staticConfig as Record<string, unknown>).ui = { branding: { productName: 'Test Hub' } }
        },
      },
    })

    try {
      await hub.ready
      const origin = 'http://localhost:5173'

      // The hub's own meta carries what the ui slot published…
      const hubMeta = await (await hub.handler(new Request(`${origin}/__devframes/__connection.json`))).json()
      expect(hubMeta.configs).toEqual({ ui: { branding: { productName: 'Test Hub' } } })

      // …and every per-frame meta carries the identical document.
      const frameMeta = await (await hub.handler(new Request(`${origin}/__devframes/alpha/__connection.json`))).json()
      expect(frameMeta.configs).toEqual(hubMeta.configs)
    }
    finally {
      await hub.close()
    }
  })

  it('omits ConnectionMeta.configs entirely when the ui slot writes nothing', async () => {
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

  it('clientModuleResolution: advertised in ConnectionMeta.configs.dock and applied in __client-imports.js', async () => {
    const wsPort = await getPort({ port: 18227, host: '127.0.0.1' })
    const hub = initHub({
      base: DEVFRAMES_HUB_BASE,
      auth: false,
      host: '127.0.0.1',
      ws: { port: wsPort },
      clientModuleResolution: '/@id/{specifier}',
      devframes: [makeFrame('alpha')],
      configure(ctx) {
        // A bare-specifier client script (the vite-plugin-vue-tracer shape),
        // registered on a host that declared the resolution, so no DF8111.
        ctx.docks.register({
          type: 'action',
          id: 'vue-tracer',
          title: 'Vue Tracer',
          icon: 'ph:crosshair-simple-duotone',
          action: { importFrom: 'vite-plugin-vue-tracer/client/vite-devtools' },
        })
        // A URL client script stays verbatim in the imports module.
        ctx.docks.register({
          type: 'action',
          id: 'bundled',
          title: 'Bundled',
          icon: 'ph:package-duotone',
          action: { importFrom: '/__devframes/agent/inject.js' },
        })
      },
    })

    try {
      await hub.ready
      const origin = 'http://localhost:5173'

      // Advertised to every client through the connection handshake.
      const meta = await (await hub.handler(new Request(`${origin}/__devframes/__connection.json`))).json()
      expect(meta.configs.dock).toEqual({ clientModuleResolution: '/@id/{specifier}' })

      // Applied server-side in the generated dock-imports module, so external
      // viewers importing it get resolvable URLs too.
      const imports = await (await hub.handler(new Request(`${origin}/__devframes/__client-imports.js`))).text()
      expect(imports).toContain('import("/@id/vite-plugin-vue-tracer/client/vite-devtools")')
      expect(imports).toContain('import("/__devframes/agent/inject.js")')
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

      // The endpoint is stateless: a single `tools/list` POST is answered per
      // request, with no `initialize` handshake and no `Mcp-Session-Id`.
      const origin = 'http://localhost:3000'
      const list = await hub.handler(new Request(`${origin}/__devframes/__mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json, text/event-stream',
          origin,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      }))
      expect(list.status).toBe(200)
      expect(list.headers.get('mcp-session-id')).toBeNull()
      const raw = await list.text()
      // Tools from both frames surface through the one aggregate endpoint.
      expect(raw).toContain('alpha-tool')
      expect(raw).toContain('beta-tool')
    }
    finally {
      await hub.close()
    }
  })

  it('aggregate MCP omitted: mounts once a mounted frame exposes agent tools', async () => {
    const wsPort = await getPort({ port: 18233, host: '127.0.0.1' })
    const hub = initHub({ base: DEVFRAMES_HUB_BASE, auth: false, host: '127.0.0.1', ws: { port: wsPort }, devframes: [makeFrame('alpha')] })

    try {
      await hub.ready
      expect(hub.connectionMeta().mcp).toEqual({ path: '__mcp' })
    }
    finally {
      await hub.close()
    }
  })

  it('aggregate MCP omitted: an empty agent surface mounts nothing', async () => {
    const wsPort = await getPort({ port: 18234, host: '127.0.0.1' })
    // No devframes, no agent-flagged hub commands: nothing to serve an agent.
    const hub = initHub({ base: DEVFRAMES_HUB_BASE, auth: false, host: '127.0.0.1', ws: { port: wsPort } })

    try {
      await hub.ready
      expect(hub.connectionMeta().mcp).toBeUndefined()
    }
    finally {
      await hub.close()
    }
  })

  it('warns (DF8005) when a mounted devframe asks for MCP but the hub MCP is off', async () => {
    const wsPort = await getPort({ port: 18235, host: '127.0.0.1' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // The hub turned MCP off, but `beta` declares `cli.mcp: true`; the hub's
    // single aggregate route governs MCP, so beta's request is a no-op and warns.
    const hub = initHub({
      base: DEVFRAMES_HUB_BASE,
      auth: false,
      host: '127.0.0.1',
      ws: { port: wsPort },
      mcp: false,
      devframes: [makeFrame('alpha'), { ...makeFrame('beta'), cli: { mcp: true } }],
    })

    try {
      await hub.ready
      expect(hub.connectionMeta().mcp).toBeUndefined()
      const warned = warn.mock.calls.map((args: unknown[]) => String(args[0])).join('\n')
      expect(warned).toMatch(/DF8005/)
      expect(warned).toContain('beta')
      // `alpha` didn't ask for MCP, so it isn't named.
      expect(warned).not.toContain('"alpha"')
    }
    finally {
      warn.mockRestore()
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
    // No `server`, no `ws`, so the hub serves its namespace and waits for the
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
        mcp: { path: '__mcp' },
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
