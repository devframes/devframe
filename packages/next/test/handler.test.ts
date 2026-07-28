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
})
