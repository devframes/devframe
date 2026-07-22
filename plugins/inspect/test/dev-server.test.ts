import type { DevframeHubContext } from '@devframes/hub/node'
import type { DevframeInspectCommandInfo, InvokeResult, RpcFunctionInfo } from '@devframes/plugin-inspect'
import type { AgentManifest } from 'devframe/types'
import type { InspectorServer } from './_utils'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { assertSpaBuilt, startInspectorHubServer, startInspectorServer } from './_utils'

vi.stubGlobal('WebSocket', WebSocket)

function connect(server: InspectorServer) {
  const channel = createWsRpcChannel({
    url: `ws://127.0.0.1:${server.port}`,
    authToken: 'test',
  })
  return createRpcClient<any, any>({}, { channel })
}

describe('inspector dev-server', () => {
  let server: InspectorServer

  beforeAll(async () => {
    assertSpaBuilt()
    server = await startInspectorServer()
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

  it('list-functions reports the inspector RPCs plus built-ins, with metadata', async () => {
    const rpc = connect(server)
    const fns = await rpc.$call('devframes:plugin:inspect:list-functions') as RpcFunctionInfo[]
    const names = fns.map(f => f.name)

    expect(names).toContain('devframes:plugin:inspect:list-functions')
    expect(names).toContain('devframes:plugin:inspect:invoke')
    expect(names).toContain('devframes:plugin:inspect:list-state-keys')
    expect(names).toContain('devframes:plugin:inspect:describe-agent')
    expect(names).toContain('devframes:plugin:inspect:list-commands')
    expect(names).toContain('devframes:plugin:inspect:execute-command')
    // The built-in shared-state RPCs are always registered on the host.
    expect(names).toContain('devframe:rpc:server-state:get')

    const listFn = fns.find(f => f.name === 'devframes:plugin:inspect:list-functions')!
    expect(listFn).toMatchObject({
      type: 'query',
      jsonSerializable: true,
      snapshot: true,
      invokable: true,
    })
    expect(listFn.agent?.description).toBeTruthy()

    const invokeFn = fns.find(f => f.name === 'devframes:plugin:inspect:invoke')!
    expect(invokeFn).toMatchObject({ type: 'action', invokable: false })
  })

  it('invoke runs a read-only query and returns a result envelope', async () => {
    const rpc = connect(server)
    const result = await rpc.$call(
      'devframes:plugin:inspect:invoke',
      'devframes:plugin:inspect:list-state-keys',
      [],
    ) as InvokeResult
    expect(result.ok).toBe(true)
    expect(Array.isArray(result.result)).toBe(true)
    expect(typeof result.durationMs).toBe('number')
  })

  it('invoke refuses to fire action / event functions', async () => {
    const rpc = connect(server)
    await expect(
      rpc.$call('devframes:plugin:inspect:invoke', 'devframes:plugin:inspect:invoke', []),
    ).rejects.toThrow(/only read-only/)
  })

  it('invoke rejects unknown function names', async () => {
    const rpc = connect(server)
    await expect(
      rpc.$call('devframes:plugin:inspect:invoke', 'does-not:exist', []),
    ).rejects.toThrow(/not registered|Cannot invoke/)
  })

  it('describe-agent surfaces the agent-exposed inspector tools', async () => {
    const rpc = connect(server)
    const manifest = await rpc.$call('devframes:plugin:inspect:describe-agent') as AgentManifest
    const toolIds = manifest.tools.map(t => t.id)
    expect(toolIds).toContain('devframes:plugin:inspect:list-functions')
    expect(toolIds).toContain('devframes:plugin:inspect:describe-agent')
  })

  it('list-commands returns an empty list outside a hub', async () => {
    const rpc = connect(server)
    const commands = await rpc.$call('devframes:plugin:inspect:list-commands') as DevframeInspectCommandInfo[]
    expect(commands).toEqual([])
  })

  it('execute-command throws when this connection has no hub commands host', async () => {
    const rpc = connect(server)
    await expect(
      rpc.$call('devframes:plugin:inspect:execute-command', 'anything', []),
    ).rejects.toThrow(/no hub commands host/)
  })
})

describe('inspector dev-server (hub)', () => {
  let server: InspectorServer<DevframeHubContext>

  beforeAll(async () => {
    assertSpaBuilt()
    server = await startInspectorHubServer()

    server.ctx.commands.register({
      id: 'demo:say-hello',
      title: 'Say Hello',
      description: 'Returns a greeting.',
      category: 'demo',
      handler: (name: string = 'world') => `Hello, ${name}!`,
    })
    server.ctx.commands.register({
      id: 'demo:group',
      title: 'Demo Group',
      children: [
        { id: 'demo:group:child', title: 'Child Command', handler: () => 'child ran' },
      ],
    })
  })

  afterAll(async () => {
    await server?.close()
  })

  it('list-commands reports registered hub commands, with children and hasHandler flags', async () => {
    const rpc = connect(server)
    const commands = await rpc.$call('devframes:plugin:inspect:list-commands') as DevframeInspectCommandInfo[]
    const byId = Object.fromEntries(commands.map(c => [c.id, c]))

    expect(byId['demo:say-hello']).toMatchObject({
      title: 'Say Hello',
      description: 'Returns a greeting.',
      category: 'demo',
      hasHandler: true,
    })

    expect(byId['demo:group']).toMatchObject({ title: 'Demo Group', hasHandler: false })
    expect(byId['demo:group'].children).toEqual([
      expect.objectContaining({ id: 'demo:group:child', hasHandler: true }),
    ])
  })

  it('execute-command runs a command handler and returns a result envelope', async () => {
    const rpc = connect(server)
    const result = await rpc.$call(
      'devframes:plugin:inspect:execute-command',
      'demo:say-hello',
      ['Ada'],
    ) as InvokeResult
    expect(result).toMatchObject({ ok: true, result: 'Hello, Ada!' })
    expect(typeof result.durationMs).toBe('number')
  })

  it('execute-command runs a nested child command by id', async () => {
    const rpc = connect(server)
    const result = await rpc.$call(
      'devframes:plugin:inspect:execute-command',
      'demo:group:child',
      [],
    ) as InvokeResult
    expect(result).toMatchObject({ ok: true, result: 'child ran' })
  })

  it('execute-command reports an error envelope for a group-only command', async () => {
    const rpc = connect(server)
    const result = await rpc.$call(
      'devframes:plugin:inspect:execute-command',
      'demo:group',
      [],
    ) as InvokeResult
    expect(result.ok).toBe(false)
    expect(result.error?.message).toMatch(/no handler/)
  })

  it('execute-command reports an error envelope for an unregistered id', async () => {
    const rpc = connect(server)
    const result = await rpc.$call(
      'devframes:plugin:inspect:execute-command',
      'does-not:exist',
      [],
    ) as InvokeResult
    expect(result.ok).toBe(false)
  })
})
