import type { AddressInfo } from 'node:net'
import type { DevframeInstanceRecord } from './instance-registry'
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listLiveDevframeInstances,
  readDevframeInstances,
  registerDevframeInstance,
} from './instance-registry'

beforeEach(() => {
  // The global vitest setup disables registration for every other test.
  vi.stubEnv('DEVFRAME_DISABLE_INSTANCE_REGISTRY', '0')
  return () => vi.unstubAllEnvs()
})

function makeRecord(overrides: Partial<DevframeInstanceRecord> = {}): DevframeInstanceRecord {
  return {
    pid: 12345,
    port: 4242,
    origin: 'http://127.0.0.1:4242',
    basePath: '/',
    id: 'test-devframe',
    name: 'Test Devframe',
    rootDir: '/tmp/project',
    mcp: { path: '/__mcp' },
    startedAt: Date.now(),
    ...overrides,
  }
}

describe('instance registry', () => {
  it('registers atomically and unregisters idempotently', () => {
    const dir = mkdtempSync(join(tmpdir(), 'devframe-registry-'))
    const record = makeRecord()

    const registration = registerDevframeInstance(record, { instancesDir: dir })
    expect(registration.file).toBe(join(dir, '12345-4242.json'))
    expect(existsSync(registration.file)).toBe(true)

    const read = readDevframeInstances({ instancesDir: dir })
    expect(read).toHaveLength(1)
    expect(read[0]).toMatchObject({ id: 'test-devframe', port: 4242, mcp: { path: '/__mcp' } })

    registration.unregister()
    expect(existsSync(registration.file)).toBe(false)
    // Idempotent.
    registration.unregister()
    expect(readDevframeInstances({ instancesDir: dir })).toEqual([])
  })

  it('skips unparseable records', () => {
    const dir = mkdtempSync(join(tmpdir(), 'devframe-registry-'))
    registerDevframeInstance(makeRecord(), { instancesDir: dir })
    // A partial write from a crashed process.
    writeFileSync(join(dir, '999-1.json'), '{ not json')

    const read = readDevframeInstances({ instancesDir: dir })
    expect(read).toHaveLength(1)
  })

  it('dedups ghost records on the same port, keeping the newest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devframe-registry-'))

    const server = createServer((req, res) => {
      res.writeHead(req.url === '/__connection.json' ? 200 : 404, { 'content-type': 'application/json' })
      res.end('{}')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port

    try {
      // A ghost from a killed process, and the current server, same port.
      registerDevframeInstance(makeRecord({
        pid: 2000,
        port,
        origin: `http://127.0.0.1:${port}`,
        startedAt: 1000,
      }), { instancesDir: dir })
      registerDevframeInstance(makeRecord({
        pid: 2001,
        port,
        origin: `http://127.0.0.1:${port}`,
        startedAt: 2000,
      }), { instancesDir: dir })

      const { live, pruned } = await listLiveDevframeInstances({ instancesDir: dir, timeoutMs: 2000 })
      expect(live.map(r => r.pid)).toEqual([2001])
      expect(pruned.map(r => r.pid)).toEqual([2000])
      expect(readdirSync(dir)).toEqual([`2001-${port}.json`])
    }
    finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('prunes dead records and keeps live ones', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devframe-registry-'))

    // A live instance: a real HTTP server answering __connection.json.
    const server = createServer((req, res) => {
      if (req.url === '/__connection.json') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"backend":"websocket"}')
        return
      }
      res.writeHead(404)
      res.end()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port

    try {
      registerDevframeInstance(makeRecord({
        pid: 1000,
        port,
        origin: `http://127.0.0.1:${port}`,
      }), { instancesDir: dir })

      // A dead instance: nothing listens on this port (bound then closed).
      const deadServer = createServer()
      await new Promise<void>(resolve => deadServer.listen(0, '127.0.0.1', resolve))
      const deadPort = (deadServer.address() as AddressInfo).port
      await new Promise<void>(resolve => deadServer.close(() => resolve()))
      registerDevframeInstance(makeRecord({
        pid: 1001,
        port: deadPort,
        origin: `http://127.0.0.1:${deadPort}`,
      }), { instancesDir: dir })

      const { live, pruned } = await listLiveDevframeInstances({ instancesDir: dir, timeoutMs: 2000 })
      expect(live.map(r => r.pid)).toEqual([1000])
      expect(pruned.map(r => r.pid)).toEqual([1001])
      // The dead record's file is gone (prune-on-read).
      expect(readdirSync(dir)).toEqual([`1000-${port}.json`])
    }
    finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
