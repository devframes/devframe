import type { DevframeRpcClient } from './rpc'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { createEventEmitter } from 'devframe/utils/events'
import { describe, expect, it, vi } from 'vitest'
import { DEVFRAME_EVENTS } from '../events'
import { createHostContext } from '../node/context'
import { createRpcSharedStateClientHost } from './rpc-shared-state'
import { createClientSettings } from './settings'

function setup(backend = 'live', trusted = true) {
  const snapshot = Promise.withResolvers<Record<string, unknown> | undefined>()
  const trust = Promise.withResolvers<boolean>()
  const handlers = new Map<string, (...args: any[]) => void>()
  // eslint-disable-next-line slop/no-chained-type-assertions -- partial RPC mock retains the shared-state implementation
  const rpc = {
    connectionMeta: { backend },
    isTrusted: trusted,
    events: createEventEmitter<any>(),
    client: { register: (fn: any) => handlers.set(fn.name, fn.handler) },
    ensureTrusted: vi.fn(() => trusted ? Promise.resolve(true) : trust.promise),
    call: vi.fn(() => snapshot.promise),
    callEvent: vi.fn(),
  } as unknown as DevframeRpcClient
  rpc.sharedState = createRpcSharedStateClientHost(rpc)
  const settings = createClientSettings(rpc, 'test')
  return { rpc, settings, snapshot, trust, handlers }
}

describe('client settings initialization', () => {
  it.each(['project', 'global'] as const)('persists the first %s write after a delayed empty snapshot', async (scope) => {
    const dir = mkdtempSync(join(tmpdir(), 'devframe-settings-'))
    const host = {
      mountStatic: () => {},
      resolveOrigin: () => 'http://localhost',
      getStorageDir: (storageScope: string) => join(dir, storageScope),
    }
    const ctx = await createHostContext({ cwd: dir, mode: 'dev', host })
    const snapshotReady = Promise.withResolvers<void>()
    const releaseSnapshot = Promise.withResolvers<void>()
    const writes: Promise<unknown>[] = []
    // eslint-disable-next-line slop/no-chained-type-assertions -- control transport timing while retaining both shared-state implementations
    const rpc = {
      connectionMeta: { backend: 'live' },
      isTrusted: true,
      ensureTrusted: async () => true,
      client: { register: () => {} },
      call: async (method: string, key: string) => {
        const value = await ctx.rpc.invokeLocal(method as any, key)
        snapshotReady.resolve()
        await releaseSnapshot.promise
        return value
      },
      callEvent: (method: string, ...args: any[]) => {
        if (method !== 'devframe:rpc:server-state:subscribe')
          writes.push(ctx.rpc.invokeLocal(method as any, ...args))
      },
    } as unknown as DevframeRpcClient
    rpc.sharedState = createRpcSharedStateClientHost(rpc)
    const settings = createClientSettings(rpc, 'new-tool')[scope]

    try {
      const write = settings.set('theme', 'dark')
      await snapshotReady.promise
      await setImmediate()
      releaseSnapshot.resolve()
      await write
      await setImmediate()
      await Promise.all(writes)

      const filepath = join(dir, scope, 'settings/new-tool.json')
      await expect.poll(() => existsSync(filepath)).toBe(true)
      expect(await settings.all()).toEqual({ theme: 'dark' })
      expect(JSON.parse(readFileSync(filepath, 'utf8'))).toEqual({ theme: 'dark' })
      const restarted = await createHostContext({ cwd: dir, mode: 'dev', host })
      expect(await restarted.scope('new-tool').settings[scope].all()).toEqual({ theme: 'dark' })
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.each(['project', 'global'] as const)('reads the initial %s snapshot before resolving', async (scope) => {
    const { settings, snapshot } = setup()
    const read = settings[scope].get('theme')
    await setImmediate()
    snapshot.resolve({ theme: 'light' })
    await expect(read).resolves.toBe('light')
  })

  it.each(['project', 'global'] as const)('preserves an immediate %s write and unrelated settings', async (scope) => {
    const { rpc, settings, snapshot } = setup()
    const write = settings[scope].set('theme', 'dark')
    const read = settings[scope].all()
    await setImmediate()
    snapshot.resolve({ theme: 'light', language: 'en' })
    await write
    await expect(settings[scope].get('theme')).resolves.toBe('dark')
    await expect(read).resolves.toEqual({ theme: 'dark', language: 'en' })
    expect(rpc.call).toHaveBeenCalledTimes(1)
  })

  it('applies an immediate deletion after the initial snapshot', async () => {
    const { settings, snapshot } = setup()
    const deletion = settings.project.delete('theme')
    await setImmediate()
    snapshot.resolve({ theme: 'light', language: 'en' })
    await deletion
    await expect(settings.project.all()).resolves.toEqual({ language: 'en' })
  })

  it.each(['live', 'static'])('starts an absent %s store with an empty object', async (backend) => {
    const { settings, snapshot } = setup(backend)
    const read = settings.project.all()
    await setImmediate()
    snapshot.resolve(undefined)
    await expect(read).resolves.toEqual({})
    await settings.project.set('theme', 'dark')
    await expect(settings.project.get('theme')).resolves.toBe('dark')
  })

  it.each(['project', 'global'] as const)('keeps an absent %s store local until a setting is written', async (scope) => {
    const { rpc, settings, snapshot } = setup()
    const onChange = vi.fn()
    const operations = Promise.all([
      settings[scope].get('theme'),
      settings[scope].all(),
      settings[scope].onChange(onChange),
      settings[scope].delete('theme'),
    ])
    snapshot.resolve(undefined)
    const [value, all, unsubscribe] = await operations
    expect(value).toBeUndefined()
    expect(all).toEqual({})
    expect(vi.mocked(rpc.callEvent).mock.calls).toEqual([
      ['devframe:rpc:server-state:subscribe', `devframe:settings:${scope}:test`],
    ])
    expect(onChange).not.toHaveBeenCalled()

    await settings[scope].set('theme', 'dark')
    expect(rpc.callEvent).toHaveBeenLastCalledWith(
      'devframe:rpc:server-state:set',
      `devframe:settings:${scope}:test`,
      { theme: 'dark' },
      expect.any(String),
    )
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ theme: 'dark' })
    unsubscribe()
  })

  it.each(['project', 'global'] as const)('preserves file storage after a browser-side %s read', async (scope) => {
    const dir = mkdtempSync(join(tmpdir(), 'devframe-settings-'))
    const host = {
      mountStatic: () => {},
      resolveOrigin: () => 'http://localhost',
      getStorageDir: (storageScope: string) => join(dir, storageScope),
    }
    const filepath = join(dir, scope, 'settings/test.json')
    mkdirSync(join(dir, scope, 'settings'), { recursive: true })
    writeFileSync(filepath, JSON.stringify({ theme: 'saved' }))
    try {
      const ctx = await createHostContext({ cwd: dir, mode: 'dev', host })
      // Dispatch RPC handlers directly without a transport session.
      vi.spyOn(ctx.rpc, 'getCurrentRpcSession').mockReturnValue(undefined)
      const { rpc, settings } = setup()
      vi.mocked(rpc.call).mockImplementation(ctx.rpc.invokeLocal.bind(ctx.rpc))
      vi.mocked(rpc.callEvent).mockImplementation(ctx.rpc.invokeLocal.bind(ctx.rpc))

      await settings[scope].all()
      const nodeSettings = ctx.scope('test').settings[scope]
      await expect(nodeSettings.get('theme')).resolves.toBe('saved')
      await nodeSettings.set('theme', 'changed')
      await vi.waitFor(() => {
        expect(JSON.parse(readFileSync(filepath, 'utf8'))).toEqual({ theme: 'changed' })
      })
      const restarted = await createHostContext({ cwd: dir, mode: 'dev', host })
      await expect(restarted.scope('test').settings[scope].get('theme')).resolves.toBe('changed')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('waits for trust before requesting the initial snapshot', async () => {
    const { rpc, settings, snapshot, trust } = setup('live', false)
    const write = settings.project.set('theme', 'dark')
    await setImmediate()
    expect(rpc.call).not.toHaveBeenCalled()
    expect(rpc.callEvent).not.toHaveBeenCalled()
    Object.defineProperty(rpc, 'isTrusted', { value: true })
    trust.resolve(true)
    snapshot.resolve({ language: 'en' })
    await write
    await expect(settings.project.all()).resolves.toEqual({ theme: 'dark', language: 'en' })
  })

  it('rejects a failed initial snapshot and retries on the next operation', async () => {
    const { rpc, settings } = setup()
    vi.mocked(rpc.call).mockRejectedValueOnce(new Error('snapshot failed'))
    await expect(settings.project.get('theme')).rejects.toThrow('snapshot failed')
    vi.mocked(rpc.call).mockResolvedValueOnce({ theme: 'light' })
    await expect(settings.project.get('theme')).resolves.toBe('light')
  })

  it('continues to accept remote updates after initialization', async () => {
    const { settings, snapshot, handlers } = setup()
    await setImmediate()
    snapshot.resolve({ theme: 'light' })
    await settings.project.set('theme', 'dark')
    handlers.get(DEVFRAME_EVENTS.broadcast.clientStateUpdated)!('devframe:settings:project:test', { theme: 'system' }, 'remote')
    await expect(settings.project.get('theme')).resolves.toBe('system')
  })
})
