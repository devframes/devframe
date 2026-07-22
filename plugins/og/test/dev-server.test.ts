import type { OgSnapshot } from '@devframes/plugin-og'
import type { OgServer } from './_utils'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { assertSpaBuilt, startOgServer } from './_utils'

vi.stubGlobal('WebSocket', WebSocket)

describe('open Graph dev server', () => {
  let server: OgServer

  beforeAll(async () => {
    assertSpaBuilt()
    server = await startOgServer()
  })

  afterAll(async () => {
    await server?.close()
  })

  it('serves the Vue SPA with relative assets', async () => {
    const response = await fetch(`${server.origin}${server.basePath}`)
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('<base href="./" />')
    expect(html).toMatch(/src="\.\/assets\/[^"?]+\.js"/)
  })

  it('resolves metadata over the plugin RPC', async () => {
    const channel = createWsRpcChannel({
      url: `ws://127.0.0.1:${server.port}`,
      authToken: 'test',
    })
    const rpc = createRpcClient<any, any>({}, { channel })
    const snapshot = await rpc.$call('devframes:plugin:og:resolve-metadata', { url: 'https://example.com/post' }) as OgSnapshot

    expect(snapshot).toMatchObject({
      requestedUrl: 'https://example.com/post',
      status: 200,
    })
    expect(snapshot.tags).toContainEqual({ tag: 'meta', name: 'og:image', value: 'https://example.com/card.png' })
  })
})
