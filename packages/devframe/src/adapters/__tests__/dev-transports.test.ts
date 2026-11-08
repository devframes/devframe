import type { CreateDevServerOptions } from '../dev'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineDevframe, defineRpcFunction } from 'devframe'
import { getDevframeRpcClient, resolveClientTransport } from 'devframe/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readDevframeInstances } from '../../node/instance-registry'
import { createDevServer } from '../dev'

const jsonHandler = vi.fn((value: unknown) => value)

const definition = defineDevframe({
  id: 'dev-transports-test',
  name: 'Dev transports test',
  version: '0.0.0',
  packageName: 'devframe-test',
  homepage: 'https://example.test',
  description: 'Test devframe.',
  setup(ctx) {
    ctx.rpc.register(defineRpcFunction({
      name: 'test:probe',
      type: 'query',
      handler: (value: unknown) => value,
    }))
    ctx.rpc.register(defineRpcFunction({
      name: 'test:json',
      type: 'query',
      jsonSerializable: true,
      handler: jsonHandler,
    }))
  },
})

const options = {
  host: '127.0.0.1',
  port: 0,
  auth: false,
  mcp: false,
  openBrowser: false,
} as const

async function expectPortReleased(port: number) {
  const listener = createServer()
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject)
    listener.listen(port, options.host, resolve)
  })
  await new Promise<void>((resolve, reject) => listener.close(error => error
    ? reject(error)
    : resolve()))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('dev server transport handle', () => {
  it('returns and disposes an SSE-only handle and its registry entry', async () => {
    const registryDir = await mkdtemp(join(tmpdir(), 'dev-transports-'))
    vi.stubEnv('DEVFRAME_INSTANCES_DIR', registryDir)
    vi.stubEnv('DEVFRAME_DISABLE_INSTANCE_REGISTRY', '0')
    try {
      const handle = await createDevServer(definition, { ...options, ws: false })
      try {
        expect(handle.ws).toBeUndefined()
        expect(handle.rpcGroup).toBeDefined()
        expect(handle.connectionMeta()).toMatchObject({
          backend: 'sse',
          sse: { path: '/__sse' },
        })
        await vi.waitFor(() => expect(readDevframeInstances({ instancesDir: registryDir })).toHaveLength(1))
        await checkRpcCalls(handle, '/', 'sse')
        await checkRpcCalls(handle, '/', 'sse', 'http')
      }
      finally {
        await handle.close()
      }
      expect(readDevframeInstances({ instancesDir: registryDir })).toEqual([])
      await expectPortReleased(handle.port)
    }
    finally {
      await rm(registryDir, { recursive: true, force: true })
    }
  })

  it.each([
    { basePath: '/', sse: true },
    {
      basePath: '/nested/tool/',
      sse: { route: '__events' },
    },
  ] satisfies CreateDevServerOptions[])('advertises and connects both transports at $basePath', async ({ basePath, sse }) => {
    const handle = await createDevServer(definition, { ...options, basePath, sse })
    try {
      const httpMeta = await fetch(`${handle.origin}${basePath}__connection.json`).then(response => response.json())
      const sseRoute = typeof sse === 'object'
        ? sse.route
        : '__sse'
      expect(httpMeta).toMatchObject({
        websocket: { path: '__ws' },
        sse: { path: sseRoute },
      })
      const snapshot = handle.connectionMeta()
      expect(snapshot).toEqual({
        ...httpMeta,
        websocket: { path: `${basePath}__ws` },
        sse: { path: `${basePath}${sseRoute}` },
      })
      expect(typeof snapshot.websocket).toBe('object')
      if (typeof snapshot.websocket === 'object')
        snapshot.websocket.path = '/viewer/__ws'
      expect(handle.connectionMeta().websocket).toEqual({ path: `${basePath}__ws` })
      expect(await fetch(`${handle.origin}${basePath}__connection.json`).then(response => response.json())).toEqual(httpMeta)
      expect(handle.connectionMeta().jsonSerializableMethods).toContain('test:json')
      expect(resolveClientTransport('auto', handle.connectionMeta())).toBe('websocket')
      await checkRpcCalls(handle, basePath, 'sse')
      await checkRpcCalls(handle, basePath, 'websocket')
      await checkRpcCalls(handle, basePath, 'websocket', 'http')
    }
    finally {
      await handle.close()
    }
    await expectPortReleased(handle.port)
  })

  it('initializes MCP from both descriptors under a nested mount', async () => {
    const basePath = '/nested/tool/'
    const handle = await createDevServer(definition, {
      ...options,
      basePath,
      mcp: { path: 'tools/mcp' },
    })
    try {
      const discovery = new URL(`${basePath}__connection.json`, handle.origin)
      const httpMeta = await fetch(discovery).then(response => response.json())
      expect(httpMeta.mcp.path).toBe('tools/mcp')

      const addresses = [
        new URL(httpMeta.mcp.path, discovery),
        new URL(handle.connectionMeta().mcp!.path, handle.origin),
      ]
      for (const address of addresses) {
        const response = await fetch(address, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'accept': 'application/json, text/event-stream',
            'origin': handle.origin,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              clientInfo: { name: 'test', version: '0.0.0' },
            },
          }),
        })
        expect(response.status).toBe(200)
        expect(await response.text()).toContain('"serverInfo"')
      }
    }
    finally {
      await handle.close()
    }
  })

  it('returns static configuration in the same JSON form as HTTP discovery', async () => {
    const url = new URL('https://example.test/help')
    const handle = await createDevServer(defineDevframe({
      ...definition,
      setup(ctx) {
        Object.assign(ctx.staticConfig, {
          help: { url },
        })
      },
    }), options)
    try {
      const discovery = await fetch(new URL('/__connection.json', handle.origin)).then(response => response.json())
      expect(discovery.configs).toEqual({
        help: { url: url.href },
      })
      expect(handle.connectionMeta().configs).toEqual(discovery.configs)
    }
    finally {
      await handle.close()
    }
  })

  it('preserves WebSocket-only operation', async () => {
    const handle = await createDevServer(definition, { ...options, sse: false })
    try {
      expect(handle.connectionMeta().sse).toBeUndefined()
      await checkRpcCalls(handle, '/', 'websocket')
    }
    finally {
      await handle.close()
    }
  })

  it('returns a closable HTTP handle with both RPC transports disabled', async () => {
    const handle = await createDevServer(definition, { ...options, ws: false, sse: false })
    try {
      expect(handle.ws).toBeUndefined()
      expect(handle.rpcGroup).toBeDefined()
      expect(handle.connectionMeta()).toMatchObject({ backend: 'none' })
      expect(handle.connectionMeta().websocket).toBeUndefined()
      expect(handle.connectionMeta().sse).toBeUndefined()
      expect(handle.connectionMeta()).not.toHaveProperty('jsonSerializableMethods')
      expect((await fetch(`${handle.origin}/__connection.json`)).status).toBe(200)
    }
    finally {
      await handle.close()
    }
    await expectPortReleased(handle.port)
  })
})

async function checkRpcCalls(handle: Awaited<ReturnType<typeof createDevServer>>, basePath: string, transport: 'sse' | 'websocket', source: 'handle' | 'http' = 'handle') {
  vi.stubGlobal('location', new URL(`${handle.origin}${basePath}`))
  vi.stubGlobal('navigator', { userAgent: 'vitest' })
  const metaBaseUrl = `${handle.origin}${basePath}__connection.json`
  const connectionMeta = source === 'http'
    ? await fetch(metaBaseUrl).then(response => response.json())
    : handle.connectionMeta()
  const client = await getDevframeRpcClient({
    connection: {
      connectionMeta,
      metaBaseUrl: source === 'http'
        ? metaBaseUrl
        : handle.origin,
    },
    transport,
    otpParam: false,
    simpleAuth: false,
  })
  try {
    await client.ensureTrusted(2000)
    expect(client.transport).toBe(transport)
    const map = new Map([
      ['key', 42],
    ])
    await expect((client.call as any)('test:probe', map)).resolves.toEqual(map)
    expect(handle.rpcGroup.clients.length).toBeGreaterThan(0)
    jsonHandler.mockClear()
    await expect((client.call as any)('test:json', { value: 42 })).resolves.toEqual({ value: 42 })
    await expect((client.call as any)('test:json', map)).rejects.toThrow(/Map/)
    expect(jsonHandler).toHaveBeenCalledTimes(1)
  }
  finally {
    client.close?.()
  }
}
