import type { DevframeRpcClient } from 'devframe/client'
import type { SharedState } from 'devframe/utils/shared-state'
import type { DevframeDockEntry } from '../../types/docks'
import { createEventEmitter } from 'devframe/utils/events'
import { describe, expect, it, vi } from 'vitest'
import { createDevframeClientHost } from '../host'

interface StubSharedState<T> extends SharedState<T> {
  push: (next: T) => void
}

function createStubSharedState<T>(initial: T): StubSharedState<T> {
  let state = initial
  const events = createEventEmitter<any>()
  return {
    value: () => state as any,
    on: events.on,
    mutate: (fn) => {
      fn(state)
      events.emit('updated', state, undefined, 'test')
    },
    patch: () => {},
    syncIds: new Set(),
    push: (next) => {
      state = next
      events.emit('updated', state, undefined, 'test')
    },
  }
}

function createStubRpc() {
  const states = new Map<string, StubSharedState<any>>()
  const rpc = {
    sharedState: {
      async get(key: string, options?: { initialValue?: any }) {
        if (!states.has(key))
          states.set(key, createStubSharedState(options?.initialValue))
        return states.get(key)!
      },
    },
    call: async () => undefined,
    client: { definitions: new Map(), register() {} },
  } as unknown as DevframeRpcClient
  return { rpc, states }
}

const jsonRenderEntry = {
  id: 'metrics',
  title: 'Metrics',
  icon: 'ph:cube',
  type: 'json-render',
  view: { stateKey: 'devframe:json-render:global:metrics' },
} as unknown as DevframeDockEntry

const container = {} as HTMLElement

describe('client host renderer registry', () => {
  it('registers renderers injected at boot', async () => {
    const { rpc } = createStubRpc()
    const host = await createDevframeClientHost({ rpc, renderers: { 'json-render': async () => ({}) } })
    expect(host.context.renderers.has('json-render')).toBe(true)
    host.dispose()
  })

  it('routes a dock type to its renderer and returns a disposer', async () => {
    const { rpc } = createStubRpc()
    const renderer = vi.fn(async () => ({ dispose: vi.fn() }))
    const host = await createDevframeClientHost({ rpc, renderers: { 'json-render': renderer } })

    const dispose = await host.context.renderers.mount(jsonRenderEntry, container)
    expect(renderer).toHaveBeenCalledWith(expect.objectContaining({ entry: jsonRenderEntry, container, context: host.context }))
    dispose()
    host.dispose()
  })

  it('warns and no-ops when no renderer is registered for the type', async () => {
    const { rpc } = createStubRpc()
    const host = await createDevframeClientHost({ rpc })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispose = await host.context.renderers.mount(jsonRenderEntry, container)
    expect(warn).toHaveBeenCalled()
    expect(() => dispose()).not.toThrow()
    warn.mockRestore()
    host.dispose()
  })

  it('disposes a mounted renderer when the dock deactivates', async () => {
    const { rpc, states } = createStubRpc()
    const disposeSpy = vi.fn()
    const host = await createDevframeClientHost({ rpc, renderers: { 'json-render': async () => ({ dispose: disposeSpy }) } })

    // Seed the dock so the entry state exists (needed for deactivation hooks).
    states.get('devframe:docks')!.push([jsonRenderEntry])

    await host.context.renderers.mount(jsonRenderEntry, container)
    await host.context.docks.switchEntry('metrics')
    await host.context.docks.switchEntry(null)
    expect(disposeSpy).toHaveBeenCalledTimes(1)
    host.dispose()
  })

  it('disposes live mounts on host teardown', async () => {
    const { rpc } = createStubRpc()
    const disposeSpy = vi.fn()
    const host = await createDevframeClientHost({ rpc, renderers: { 'json-render': async () => ({ dispose: disposeSpy }) } })
    await host.context.renderers.mount(jsonRenderEntry, container)
    host.dispose()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })
})
