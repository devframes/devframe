import type { EnvSnapshot, MemorySnapshot, SystemInfo } from '../src/devframe'
import process from 'node:process'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { startSnapshotServer } from './_utils'

vi.stubGlobal('WebSocket', WebSocket)

function bootRpc(port: number) {
  const channel = createWsRpcChannel({ url: `ws://127.0.0.1:${port}` })
  return createRpcClient<any, any>({}, { channel })
}

describe('next-runtime-snapshot (example)', () => {
  let server: Awaited<ReturnType<typeof startSnapshotServer>>

  beforeEach(async () => {
    server = await startSnapshotServer()
  })

  afterEach(async () => {
    await server?.close()
  })

  it('serves connection meta pointing at the WS backend', async () => {
    const res = await fetch(`${server.origin}${server.basePath}__connection.json`)
    expect(res.status).toBe(200)
    const meta = await res.json() as { backend: string, websocket: number }
    expect(meta.backend).toBe('websocket')
    expect(meta.websocket).toBe(server.port)
  })

  it('returns system info from the static RPC', async () => {
    const rpc = bootRpc(server.port)
    const info = await rpc.$call('next-runtime-snapshot:system') as SystemInfo
    expect(info.node).toBe(process.version)
    expect(info.platform).toBe(process.platform)
    expect(info.arch).toBe(process.arch)
    expect(info.pid).toBe(process.pid)
    expect(info.cwd).toBe(process.cwd())
    expect(typeof info.startedAt).toBe('number')
  })

  it('returns a memory snapshot with the expected shape', async () => {
    const rpc = bootRpc(server.port)
    const snap = await rpc.$call('next-runtime-snapshot:memory') as MemorySnapshot
    expect(snap.memory.rss).toBeGreaterThan(0)
    expect(snap.memory.heapTotal).toBeGreaterThan(0)
    expect(snap.memory.heapUsed).toBeGreaterThan(0)
    expect(snap.uptimeSeconds).toBeGreaterThan(0)
    expect(typeof snap.capturedAt).toBe('number')
  })

  it('refreshing memory yields monotonically non-decreasing uptime', async () => {
    const rpc = bootRpc(server.port)
    const first = await rpc.$call('next-runtime-snapshot:memory') as MemorySnapshot
    await new Promise(r => setTimeout(r, 30))
    const second = await rpc.$call('next-runtime-snapshot:memory') as MemorySnapshot
    expect(second.uptimeSeconds).toBeGreaterThanOrEqual(first.uptimeSeconds)
    expect(second.capturedAt).toBeGreaterThanOrEqual(first.capturedAt)
  })

  it('filters env vars by case-insensitive regex pattern', async () => {
    const rpc = bootRpc(server.port)
    // Seed an env var that is guaranteed to match the filter.
    process.env.DEVFRAME_TEST_MARKER = 'present'
    try {
      const snap = await rpc.$call('next-runtime-snapshot:env', { pattern: 'devframe_test_marker' }) as EnvSnapshot
      expect(snap.pattern).toBe('devframe_test_marker')
      expect(snap.total).toBe(1)
      const entry = snap.entries.find(e => e.key === 'DEVFRAME_TEST_MARKER')
      expect(entry).toBeDefined()
      expect(entry!.value).toBe('present')
      expect(entry!.redacted).toBe(false)
    }
    finally {
      delete process.env.DEVFRAME_TEST_MARKER
    }
  })

  it('redacts values for keys matching the secret pattern', async () => {
    const rpc = bootRpc(server.port)
    process.env.DEVFRAME_TEST_API_KEY = 'sk-xyz-123'
    process.env.DEVFRAME_TEST_SECRET_PAYLOAD = 'shh'
    try {
      const snap = await rpc.$call('next-runtime-snapshot:env', { pattern: 'DEVFRAME_TEST_' }) as EnvSnapshot
      const apiKey = snap.entries.find(e => e.key === 'DEVFRAME_TEST_API_KEY')!
      const secret = snap.entries.find(e => e.key === 'DEVFRAME_TEST_SECRET_PAYLOAD')!
      expect(apiKey.redacted).toBe(true)
      expect(apiKey.value).not.toContain('xyz')
      expect(secret.redacted).toBe(true)
      expect(secret.value).not.toContain('shh')
    }
    finally {
      delete process.env.DEVFRAME_TEST_API_KEY
      delete process.env.DEVFRAME_TEST_SECRET_PAYLOAD
    }
  })

  it('returns all env vars when no pattern is supplied (up to the limit)', async () => {
    const rpc = bootRpc(server.port)
    const snap = await rpc.$call('next-runtime-snapshot:env', { pattern: '', limit: 5 }) as EnvSnapshot
    expect(snap.entries.length).toBeLessThanOrEqual(5)
    expect(snap.total).toBeGreaterThan(0)
    expect(snap.total).toBeGreaterThanOrEqual(snap.entries.length)
  })

  it('matches nothing on an invalid regex pattern', async () => {
    const rpc = bootRpc(server.port)
    // '[' is unterminated — `new RegExp('[', 'i')` throws SyntaxError.
    const snap = await rpc.$call('next-runtime-snapshot:env', { pattern: '[' }) as EnvSnapshot
    expect(snap.entries).toEqual([])
    expect(snap.total).toBe(0)
    expect(snap.pattern).toBe('[')
  })

  it('respects the limit cap on the entries slice', async () => {
    const rpc = bootRpc(server.port)
    const small = await rpc.$call('next-runtime-snapshot:env', { pattern: '', limit: 2 }) as EnvSnapshot
    const big = await rpc.$call('next-runtime-snapshot:env', { pattern: '', limit: 100 }) as EnvSnapshot
    expect(small.entries.length).toBeLessThanOrEqual(2)
    expect(big.entries.length).toBeGreaterThanOrEqual(small.entries.length)
    expect(big.total).toBe(small.total)
  })
})
