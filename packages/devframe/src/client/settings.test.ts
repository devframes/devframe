import type { DevframeRpcClient } from './rpc'
import { setImmediate } from 'node:timers/promises'
import { createEventEmitter } from 'devframe/utils/events'
import { describe, expect, it, vi } from 'vitest'
import { DEVFRAME_EVENTS } from '../events'
import { createRpcSharedStateClientHost } from './rpc-shared-state'
import { createClientSettings } from './settings'

function setup(backend = 'websocket', trusted = true) {
  const snapshot = Promise.withResolvers<Record<string, unknown> | undefined>()
  const trust = Promise.withResolvers<boolean>()
  const handlers = new Map<string, (...args: any[]) => void>()
  // eslint-disable-next-line slop/no-chained-type-assertions -- partial RPC mock retains the real shared-state client
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

  it.each(['websocket', 'static'])('starts an absent %s store with an empty object', async (backend) => {
    const { settings, snapshot } = setup(backend)
    const read = settings.project.all()
    await setImmediate()
    snapshot.resolve(undefined)
    await expect(read).resolves.toEqual({})
    await settings.project.set('theme', 'dark')
    await expect(settings.project.get('theme')).resolves.toBe('dark')
  })

  it('waits for trust before requesting the initial snapshot', async () => {
    const { rpc, settings, snapshot, trust } = setup('websocket', false)
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
