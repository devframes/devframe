import type { DevframeRpcClient } from './rpc'
import { createSharedState } from 'devframe/utils/shared-state'
import { describe, expect, it, vi } from 'vitest'
import { createScopedClientContext } from './scope'

function createMockClient() {
  const states = new Map<string, ReturnType<typeof createSharedState>>()
  const registered: any[] = []
  const subscribes: [string, string][] = []
  const uploads: [string, string][] = []

  const rpc = {
    call: vi.fn((..._args: any[]) => Promise.resolve('ok')),
    callEvent: vi.fn((..._args: any[]) => {}),
    callOptional: vi.fn((..._args: any[]) => Promise.resolve('ok')),
    client: { register: vi.fn((fn: any) => registered.push(fn)) },
    sharedState: {
      get: vi.fn((key: string, options?: any) => {
        if (!states.has(key))
          states.set(key, createSharedState({ initialValue: options?.initialValue ?? {} }))
        return Promise.resolve(states.get(key)!)
      }),
    },
    streaming: {
      subscribe: vi.fn((channel: string, id: string) => {
        subscribes.push([channel, id])
        return {} as any
      }),
      upload: vi.fn((channel: string, id: string) => {
        uploads.push([channel, id])
        return {} as any
      }),
    },
  } as unknown as DevframeRpcClient

  return { rpc, registered, subscribes, uploads }
}

describe('client.scope()', () => {
  it('exposes namespace and base', () => {
    const { rpc } = createMockClient()
    const scoped = createScopedClientContext(rpc, 'my-plugin')
    expect(scoped.namespace).toBe('my-plugin')
    expect(scoped.base).toBe(rpc)
    expect(scoped.rpc.namespace).toBe('my-plugin')
  })

  it('qualifies bare call/callEvent/callOptional method names', () => {
    const { rpc } = createMockClient()
    const scoped = createScopedClientContext(rpc, 'my-plugin')

    scoped.rpc.call('add' as any, 1, 2)
    expect(rpc.call).toHaveBeenCalledWith('my-plugin:add', 1, 2)

    scoped.rpc.callEvent('ping' as any)
    expect(rpc.callEvent).toHaveBeenCalledWith('my-plugin:ping')

    scoped.rpc.callOptional('maybe' as any)
    expect(rpc.callOptional).toHaveBeenCalledWith('my-plugin:maybe')
  })

  it('passes through already-qualified call names', () => {
    const { rpc } = createMockClient()
    createScopedClientContext(rpc, 'my-plugin').rpc.call('other:fn' as any)
    expect(rpc.call).toHaveBeenCalledWith('other:fn')
  })

  it('prefixes registered client function names', () => {
    const { rpc, registered } = createMockClient()
    createScopedClientContext(rpc, 'my-plugin').rpc.register({
      name: 'tick',
      type: 'event',
      handler: () => {},
    } as any)
    expect(registered[0].name).toBe('my-plugin:tick')
  })

  it('throws when registering an already-namespaced client function', () => {
    const { rpc } = createMockClient()
    const register = () => createScopedClientContext(rpc, 'my-plugin').rpc.register({
      name: 'my-plugin:tick',
      type: 'event',
      handler: () => {},
    } as any)
    expect(register).toThrow('already-namespaced')
  })

  it('qualifies shared-state keys', async () => {
    const { rpc } = createMockClient()
    await createScopedClientContext(rpc, 'my-plugin').rpc.sharedState('messages', { initialValue: {} })
    expect(rpc.sharedState.get).toHaveBeenCalledWith('my-plugin:messages', { initialValue: {} })
  })

  it('qualifies streaming channel names', () => {
    const { rpc, subscribes, uploads } = createMockClient()
    const scoped = createScopedClientContext(rpc, 'my-plugin')
    scoped.rpc.streaming.subscribe('chat', '1')
    scoped.rpc.streaming.upload('chat', '2')
    expect(subscribes).toEqual([['my-plugin:chat', '1']])
    expect(uploads).toEqual([['my-plugin:chat', '2']])
  })

  it('round-trips settings through namespaced shared states', async () => {
    const { rpc } = createMockClient()
    const { settings } = createScopedClientContext(rpc, 'my-plugin')

    await settings.global.set('token', 'abc')
    expect(rpc.sharedState.get).toHaveBeenCalledWith('devframe:settings:global:my-plugin', { initialValue: {} })
    expect(await settings.global.get('token')).toBe('abc')

    await settings.project.set('theme', 'dark')
    expect(await settings.project.all()).toEqual({ theme: 'dark' })
    await settings.project.delete('theme')
    expect(await settings.project.get('theme')).toBeUndefined()
  })
})
