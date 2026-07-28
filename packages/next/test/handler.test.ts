import type { DevframeDefinition } from 'devframe/types'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDevframeNextHandler } from '../src/handler'

function makeDef(distDir: string): DevframeDefinition {
  return {
    id: 'test-next',
    name: 'Test Next',
    version: '0.0.0',
    packageName: '@test/next',
    homepage: '',
    description: '',
    cli: { distDir },
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
    expect(body.websocket.path).toBe('/__devframe_ws')

    // Unmounted base → bare 404.
    const miss = await handler.fetch(new Request(`${origin}/__other/x`))
    expect(miss.status).toBe(404)
    expect(await miss.text()).toBe('')
  })

  it('throws when the definition has no built SPA', () => {
    const def = makeDef('')
    def.cli = undefined
    expect(() => createDevframeNextHandler(def)).toThrow(/cli\.distDir/)
  })

  it('forwards the mcp option and advertises the side-car endpoint', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'df-next-mcp-'))
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>ok</title>')

    handler = createDevframeNextHandler(makeDef(dist), { host: '127.0.0.1', mcp: true })
    await handler.ready

    const meta = await handler.fetch(new Request('http://localhost:3000/__test-next/__connection.json'))
    const body = await meta.json() as {
      websocket: { port: number, path: string }
      mcp?: { port: number, path: string }
    }
    expect(body.mcp).toEqual({ port: body.websocket.port, path: '/__mcp' })

    // The advertised endpoint answers MCP initialize on the side-car origin.
    const init = await fetch(`http://127.0.0.1:${body.mcp!.port}${body.mcp!.path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'x', version: '0' } },
      }),
    })
    expect(init.status).toBe(200)
    expect(init.headers.get('mcp-session-id')).toBeTruthy()
    await init.body?.cancel()
  })
})
