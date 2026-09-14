import type { DevframeHost, McpAuthorization, McpConnectionInfo } from 'devframe/types'
import { createHostContext } from 'devframe/node'
import { isLoopbackAddress } from 'devframe/utils/origin'
import { afterEach, describe, expect, it } from 'vitest'
import { createMcpFetchHandler } from '../fetch'

function nullHost(): DevframeHost {
  return {
    mountStatic: () => { /* no-op */ },
    resolveOrigin: () => 'http://localhost',
    getStorageDir: () => '/tmp/devframe-test-storage',
  }
}

const disposers: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(disposers.splice(0).map(d => d()))
})

async function handlerWith(options: { authorization?: McpAuthorization, allowedOrigins?: readonly string[] | false } = {}) {
  const ctx = await createHostContext({ cwd: process.cwd(), mode: 'dev', host: nullHost() })
  ctx.agent.registerTool({ id: 'greet', description: 'Say hello.', safety: 'read', handler: () => ({ greeting: 'hi' }) })
  const handler = createMcpFetchHandler(ctx, {
    serverName: 'test',
    serverVersion: '0.0.0-test',
    exposeSharedState: true,
    ...options,
  })
  disposers.push(handler.dispose)
  return handler
}

/** A well-formed `initialize` request carrying a (forgeable) loopback Origin. */
function initRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/__mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
      'origin': 'http://localhost',
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'x', version: '0' } },
    }),
  })
}

async function status(handler: Awaited<ReturnType<typeof handlerWith>>, connection?: McpConnectionInfo): Promise<number> {
  const res = await handler.fetch(initRequest(), connection)
  await res.body?.cancel()
  return res.status
}

describe('mcp locality gate (origin-only default)', () => {
  it('rejects a forged loopback Origin from a non-loopback peer with 403', async () => {
    // The reported RCE: a raw network client sends `Origin: http://localhost`
    // to pass the origin gate. The peer address it cannot forge gives it away.
    const handler = await handlerWith()
    expect(await status(handler, { remoteAddress: '203.0.113.7' })).toBe(403)
  })

  it('allows a loopback peer (local dev keeps working with zero config)', async () => {
    const handler = await handlerWith()
    expect(await status(handler, { remoteAddress: '127.0.0.1' })).toBe(200)
  })

  it('allows an IPv4-mapped IPv6 loopback peer from a dual-stack listener', async () => {
    const handler = await handlerWith()
    expect(await status(handler, { remoteAddress: '::ffff:127.0.0.1' })).toBe(200)
  })

  it('falls back to origin-only when the host cannot resolve a peer address', async () => {
    const handler = await handlerWith()
    expect(await status(handler, {})).toBe(200)
    expect(await status(handler, undefined)).toBe(200)
  })

  it('an identity check lifts the loopback-peer restriction', async () => {
    const handler = await handlerWith({ authorization: 'a-high-entropy-test-bearer-token' })
    expect(await status(handler, { remoteAddress: '203.0.113.7' })).toBe(401)
    const ok = await handler.fetch(
      initRequest({ authorization: 'Bearer a-high-entropy-test-bearer-token' }),
      { remoteAddress: '203.0.113.7' },
    )
    await ok.body?.cancel()
    expect(ok.status).toBe(200)
  })

  it('allowedOrigins: false opts out of both origin and locality gates', async () => {
    const handler = await handlerWith({ allowedOrigins: false })
    expect(await status(handler, { remoteAddress: '203.0.113.7' })).toBe(200)
  })
})

describe('isLoopbackAddress', () => {
  it('accepts loopback literals a socket reports', () => {
    for (const a of ['127.0.0.1', '127.5.5.5', '::1', '::ffff:127.0.0.1', '[::1]'])
      expect(isLoopbackAddress(a)).toBe(true)
  })

  it('rejects routable and mapped-routable addresses', () => {
    for (const a of ['203.0.113.7', '10.0.0.5', '192.168.1.9', '::ffff:203.0.113.7', '0.0.0.0'])
      expect(isLoopbackAddress(a)).toBe(false)
  })
})
