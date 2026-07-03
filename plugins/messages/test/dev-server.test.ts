import type { DevframeMessageEntry, DevframeMessagesListDelta } from '@devframes/plugin-messages'
import type { MessagesServer } from './_utils'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { assertSpaBuilt, startMessagesHubServer, startMessagesServer } from './_utils'

vi.stubGlobal('WebSocket', WebSocket)

function connect(server: MessagesServer) {
  const channel = createWsRpcChannel({
    url: `ws://127.0.0.1:${server.port}`,
    authToken: 'test',
  })
  return createRpcClient<any, any>({}, { channel })
}

describe('messages dev-server (hub context)', () => {
  let server: Awaited<ReturnType<typeof startMessagesHubServer>>

  beforeAll(async () => {
    assertSpaBuilt()
    server = await startMessagesHubServer()
  })

  afterAll(async () => {
    await server?.close()
  })

  it('serves the SPA index.html with relative asset URLs', async () => {
    const res = await fetch(`${server.origin}${server.basePath}`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<base href="./" />')
    expect(html).toMatch(/src="\.\/assets\/[^"]+\.js"/)
  })

  it('serves a websocket connection meta at the SPA root', async () => {
    const res = await fetch(`${server.origin}${server.basePath}__connection.json`)
    const meta = await res.json() as { backend: string, websocket: number }
    expect(meta.backend).toBe('websocket')
    expect(meta.websocket).toBe(server.port)
  })

  it('registers the open-in-editor recipe alongside the feed RPCs', () => {
    const names = Array.from(server.ctx.rpc.definitions.keys())
    expect(names).toContain('devframes-plugin-messages:list')
    expect(names).toContain('devframes-plugin-messages:add')
    expect(names).toContain('devframes-plugin-messages:update')
    expect(names).toContain('devframes-plugin-messages:remove')
    expect(names).toContain('devframes-plugin-messages:clear')
    expect(names).toContain('devframe:open-in-editor')
  })

  it('lists server-side entries and delta-syncs from a cursor', async () => {
    const rpc = connect(server)
    await server.ctx.messages.add({ id: 'from-server', level: 'info', message: 'hello' })

    const full = await rpc.$call('devframes-plugin-messages:list') as DevframeMessagesListDelta
    expect(full.full).toBe(true)
    expect(full.entries.map(e => e.id)).toContain('from-server')

    await server.ctx.messages.add({ id: 'later', level: 'warn', message: 'later' })
    await server.ctx.messages.remove('from-server')

    const delta = await rpc.$call('devframes-plugin-messages:list', full.version) as DevframeMessagesListDelta
    expect(delta.full).toBe(false)
    expect(delta.entries.map(e => e.id)).toEqual(['later'])
    expect(delta.removedIds).toContain('from-server')
  })

  it('add stamps browser origin; update patches; clear empties', async () => {
    const rpc = connect(server)

    const added = await rpc.$call('devframes-plugin-messages:add', {
      level: 'info',
      message: 'from the panel',
    }) as DevframeMessageEntry
    expect(added.from).toBe('browser')
    expect(server.ctx.messages.entries.get(added.id)?.message).toBe('from the panel')

    const updated = await rpc.$call('devframes-plugin-messages:update', added.id, {
      level: 'success',
    }) as DevframeMessageEntry
    expect(updated.level).toBe('success')
    expect(updated.from).toBe('browser')

    await rpc.$call('devframes-plugin-messages:remove', added.id)
    expect(server.ctx.messages.entries.has(added.id)).toBe(false)

    await server.ctx.messages.add({ level: 'debug', message: 'leftover' })
    await rpc.$call('devframes-plugin-messages:clear')
    expect(server.ctx.messages.entries.size).toBe(0)
  })
})

describe('messages dev-server (plain context — warn + noop)', () => {
  let server: MessagesServer
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  beforeAll(async () => {
    assertSpaBuilt()
    server = await startMessagesServer()
  })

  afterAll(async () => {
    await server?.close()
    warn.mockRestore()
  })

  it('warns DP_MESSAGES_0001 when no messages host is attached', () => {
    const output = warn.mock.calls.flat().map(String).join('\n')
    expect(output).toContain('DP_MESSAGES_0001')
  })

  it('list no-ops with an empty full snapshot', async () => {
    const rpc = connect(server)
    const result = await rpc.$call('devframes-plugin-messages:list') as DevframeMessagesListDelta
    expect(result).toEqual({ entries: [], removedIds: [], version: 0, full: true })
  })

  it('mutations no-op without throwing', async () => {
    const rpc = connect(server)
    const added = await rpc.$call('devframes-plugin-messages:add', { level: 'info', message: 'x' })
    expect(added).toBeNull()
    await expect(rpc.$call('devframes-plugin-messages:remove', 'nope')).resolves.toBeUndefined()
    await expect(rpc.$call('devframes-plugin-messages:clear')).resolves.toBeUndefined()
  })
})
