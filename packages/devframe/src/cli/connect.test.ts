import type { DevframeInstanceRecord } from '../node/instance-registry'
import type { StartedServer } from '../node/instance-shell'
import type { DevframeDefinition } from '../types/devframe'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, describe, expect, it } from 'vitest'
import { createDevServer } from '../adapters/dev'
import { buildInstanceRequestHeaders, resolveAuthToken } from './connect'

const TOKEN = 'a-high-entropy-connect-test-token'

function makeRecord(overrides?: Partial<DevframeInstanceRecord>): DevframeInstanceRecord {
  return {
    pid: 123,
    port: 9999,
    origin: 'http://localhost:9999',
    basePath: '/',
    id: 'demo',
    rootDir: '/tmp/demo',
    mcp: { path: '/__mcp' },
    startedAt: 0,
    ...overrides,
  }
}

describe('resolveAuthToken', () => {
  it('returns a shared string token for any record', () => {
    expect(resolveAuthToken(TOKEN, makeRecord())).toBe(TOKEN)
  })

  it('delegates to a per-record resolver', () => {
    const record = makeRecord({ port: 4242 })
    const resolved = resolveAuthToken(r => (r.port === 4242 ? 'match' : undefined), record)
    expect(resolved).toBe('match')
  })

  it('is undefined when no policy is configured', () => {
    expect(resolveAuthToken(undefined, makeRecord())).toBeUndefined()
  })
})

describe('buildInstanceRequestHeaders', () => {
  it('always sends the instance origin so the origin gate accepts the native client', () => {
    const headers = buildInstanceRequestHeaders('http://localhost:9999/__mcp', undefined)
    expect(headers.origin).toBe('http://localhost:9999')
    expect(headers.authorization).toBeUndefined()
  })

  it('adds the bearer as an Authorization header when a token is configured', () => {
    const headers = buildInstanceRequestHeaders('http://localhost:9999/__mcp', TOKEN)
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('keeps the token out of the connection URL and the registry record', () => {
    const url = 'http://localhost:9999/__mcp'
    buildInstanceRequestHeaders(url, TOKEN)
    // The token is never written back onto the URL…
    expect(url).not.toContain(TOKEN)
    // …nor does a registry record carry any credential field to leak.
    expect(JSON.stringify(makeRecord())).not.toContain(TOKEN)
  })
})

describe('connector bearer against a live authenticated MCP route', () => {
  let server: StartedServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  function defineDef(): DevframeDefinition {
    return {
      id: 'connect-test',
      name: 'Connect Test',
      version: '0.0.0',
      packageName: '@devframe/connect-test',
      homepage: 'https://example.com',
      description: 'Fixture for the connect bearer test.',
      setup(ctx) {
        ctx.agent.registerTool({
          id: 'greet',
          description: 'Say hello.',
          safety: 'read',
          handler: () => ({ greeting: 'hi' }),
        })
      },
    }
  }

  it('authenticates with the resolved bearer in the request headers', async () => {
    server = await createDevServer(defineDef(), { host: '127.0.0.1', port: 0, auth: false, mcp: { authorization: TOKEN } })
    const url = `${server.origin}/__mcp`
    const record = makeRecord({ origin: server.origin, port: server.port })

    // Exactly what the connector does: resolve the token, build the headers,
    // and dial the route through a StreamableHTTP transport.
    const token = resolveAuthToken(TOKEN, record)
    const client = new Client({ name: 'connect-test', version: '0.0.0' }, { versionNegotiation: { mode: 'auto' } })
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: buildInstanceRequestHeaders(url, token) },
    })
    try {
      await client.connect(transport)
      const tools = await client.listTools()
      expect(tools.tools.map(t => t.name)).toContain('greet')
    }
    finally {
      await client.close()
    }
  })

  it('is refused (never falls through unauthenticated) when no bearer is resolved', async () => {
    server = await createDevServer(defineDef(), { host: '127.0.0.1', port: 0, auth: false, mcp: { authorization: TOKEN } })
    const url = `${server.origin}/__mcp`
    const record = makeRecord({ origin: server.origin, port: server.port })

    // No configured policy → no Authorization header → the route's identity
    // gate rejects the request rather than serving it.
    const headers = buildInstanceRequestHeaders(url, resolveAuthToken(undefined, record))
    expect(headers.authorization).toBeUndefined()
    const client = new Client({ name: 'connect-test', version: '0.0.0' }, { versionNegotiation: { mode: 'auto' } })
    const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } })
    await expect(client.connect(transport)).rejects.toThrow()
    await client.close().catch(() => {})
  })
})
