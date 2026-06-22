import type { InspectorServer } from './_utils'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { assertClientBuilt, startInspectorServer } from './_utils'

vi.stubGlobal('WebSocket', WebSocket)

describe('dev-server (CLI surface)', () => {
  let server: InspectorServer

  beforeAll(async () => {
    assertClientBuilt()
    server = await startInspectorServer()
  })

  afterAll(async () => {
    await server?.close()
  })

  it('serves index.html with relative asset URLs at the devframe base', async () => {
    const res = await fetch(`${server.origin}${server.basePath}`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<base href="./" />')
    expect(html).toMatch(/src="\.\/assets\/[^"]+\.js"/)
  })

  it('serves the connection meta pointing at the WebSocket backend', async () => {
    const res = await fetch(`${server.origin}${server.basePath}__connection.json`)
    expect(res.status).toBe(200)
    const meta = await res.json() as { backend: string, websocket: number }
    expect(meta.backend).toBe('websocket')
    expect(meta.websocket).toBe(server.port)
  })

  it('answers get-config over WebSocket RPC', async () => {
    const channel = createWsRpcChannel({
      url: `ws://127.0.0.1:${server.port}`,
      authToken: 'test',
    })
    const rpc = createRpcClient<any, any>({}, { channel })

    const config = await rpc.$call('devframe-a11y-inspector:get-config') as {
      channel: string
      nodeAttr: string
      impacts: { id: string }[]
    }
    expect(config.channel).toBe('devframe-a11y-inspector')
    expect(config.nodeAttr).toBe('data-df-a11y-node')
    expect(config.impacts.map(i => i.id)).toEqual(['critical', 'serious', 'moderate', 'minor'])
  })
})
