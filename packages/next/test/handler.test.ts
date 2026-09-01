import type { DevframeDefinition } from 'devframe'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDevframeNextHandler } from '../src/handler'

function makeDef(clientAssets: string): DevframeDefinition {
  return {
    id: 'test-next',
    name: 'Test Next',
    version: '0.0.0',
    packageName: '@test/next',
    homepage: '',
    description: '',
    clientAssets,
    setup() {},
  }
}

describe('createDevframeNextHandler', () => {
  let handler: ReturnType<typeof createDevframeNextHandler> | undefined

  afterEach(async () => {
    await handler?.close()
    handler = undefined
  })

  it('serves the SPA and advertises the side-car WS endpoint', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'df-next-'))
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>ok</title>')

    handler = createDevframeNextHandler(makeDef(dist), { host: '127.0.0.1' })
    await handler.ready

    const origin = 'http://localhost:3000'

    // Base → index.html.
    const index = await handler.fetch(new Request(`${origin}/__test-next/`))
    expect(index.status).toBe(200)
    expect(index.headers.get('content-type')).toContain('text/html')

    // SPA fallback for an extensionless in-app route.
    const spa = await handler.fetch(new Request(`${origin}/__test-next/some/view`))
    expect(spa.status).toBe(200)

    // Connection meta points at the side-car WS port.
    const meta = await handler.fetch(new Request(`${origin}/__test-next/__connection.json`))
    expect(meta.status).toBe(200)
    const body = await meta.json() as { backend: string, websocket: { port: number, path: string } }
    expect(body.backend).toBe('websocket')
    expect(typeof body.websocket.port).toBe('number')
    expect(body.websocket.path).toBe('__ws')

    // Unmounted base → bare 404.
    const miss = await handler.fetch(new Request(`${origin}/__other/x`))
    expect(miss.status).toBe(404)
    expect(await miss.text()).toBe('')
  })

  it('throws when the definition has no built SPA', () => {
    const def = makeDef('')
    def.clientAssets = undefined
    expect(() => createDevframeNextHandler(def)).toThrow(/clientAssets/)
  })

  it('falls back to the deprecated cli.distDir', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'df-next-legacy-'))
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>ok</title>')

    const def = makeDef('')
    def.clientAssets = undefined
    def.cli = { distDir: dist }

    handler = createDevframeNextHandler(def, { host: '127.0.0.1' })
    await handler.ready

    const index = await handler.fetch(new Request('http://localhost:3000/__test-next/'))
    expect(index.status).toBe(200)
  })

  it('forwards the mcp option and advertises the side-car endpoint', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'df-next-mcp-'))
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>ok</title>')

    // Origin-only opt-out keeps this loopback-bound handler test free of
    // bearer plumbing; the identity gate is covered in devframe's
    // mcp-http.test.ts.
    handler = createDevframeNextHandler(makeDef(dist), { host: '127.0.0.1', mcp: { authorization: false } })
    await handler.ready

    const meta = await handler.fetch(new Request('http://localhost:3000/__test-next/__connection.json'))
    const body = await meta.json() as {
      websocket: { port: number, path: string }
      mcp?: { port: number, path: string }
    }
    // The MCP route lives on the Next app's own origin now — a same-origin
    // relative path next to __connection.json, served through the same
    // catch-all route as the SPA.
    expect(body.mcp).toEqual({ path: '__mcp' })

    // The advertised endpoint answers MCP initialize through the route
    // handler when a loopback Origin (required by the route's gate) is
    // presented. A 2025-era `initialize` is served statelessly through the
    // SDK's default legacy path — answered per request with no
    // `Mcp-Session-Id`.
    const origin = 'http://localhost:3000'
    const initBody = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'x', version: '0' } },
    })
    const init = await handler.fetch(new Request(`${origin}/__test-next/__mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        origin,
      },
      body: initBody,
    }))
    expect(init.status).toBe(200)
    expect(init.headers.get('mcp-session-id')).toBeNull()
    await init.body?.cancel()

    // Without an Origin header the same request is rejected.
    const unauthed = await handler.fetch(new Request(`${origin}/__test-next/__mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
      },
      body: initBody,
    }))
    await unauthed.body?.cancel()
    expect(unauthed.status).toBe(403)
  })
})
