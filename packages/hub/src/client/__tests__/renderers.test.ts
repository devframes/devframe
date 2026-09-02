import type { DevframeRpcClient } from 'devframe/client'
import type { SharedState } from 'devframe/utils/shared-state'
import type { DevframeDockEntry } from '../../types/docks'
import { createEventEmitter } from 'devframe/utils/events'
import { describe, expect, it, vi } from 'vitest'
import { createDevframeClientRuntime } from '../host'

type DeepPartial<T> = { [K in keyof T]?: DeepPartial<T[K]> }

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
  const partial: DeepPartial<DevframeRpcClient> = {
    sharedState: {
      async get(key: string, options?: { initialValue?: any }) {
        if (!states.has(key))
          states.set(key, createStubSharedState(options?.initialValue))
        return states.get(key)!
      },
    },
    call: async () => undefined,
    client: { definitions: new Map(), register() {} },
  }
  const rpc = partial as DevframeRpcClient
  return { rpc, states }
}

// eslint-disable-next-line slop/no-chained-type-assertions -- `json-render` is a declaration-merged dock variant contributed by `@devframes/json-render/hub`, absent from the static registry this test compiles against
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
    const host = await createDevframeClientRuntime({ rpc, renderers: { 'json-render': async () => ({}) } })
    expect(host.context.renderers.has('json-render')).toBe(true)
    host.dispose()
  })

  it('routes a dock type to its renderer and resolves a mounted result', async () => {
    const { rpc } = createStubRpc()
    const renderer = vi.fn(async () => ({ dispose: vi.fn() }))
    const host = await createDevframeClientRuntime({ rpc, renderers: { 'json-render': renderer } })

    const result = await host.context.renderers.mount(jsonRenderEntry, container)
    expect(renderer).toHaveBeenCalledWith(expect.objectContaining({ entry: jsonRenderEntry, container, context: host.context }))
    expect(result.status).toBe('mounted')
    if (result.status === 'mounted')
      result.dispose()
    host.dispose()
  })

  it('warns and resolves missing-renderer when no renderer covers the type', async () => {
    const { rpc } = createStubRpc()
    const host = await createDevframeClientRuntime({ rpc })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(host.context.renderers.has('json-render')).toBe(false)
    const result = await host.context.renderers.mount(jsonRenderEntry, container)
    expect(warn).toHaveBeenCalled()
    expect(result.status).toBe('missing-renderer')
    warn.mockRestore()
    host.dispose()
  })

  it('lazily imports a manifest renderer module and reuses it', async () => {
    const { rpc, states } = createStubRpc()
    const host = await createDevframeClientRuntime({ rpc })
    const moduleUrl = 'data:text/javascript,globalThis.__manifestMounts = 0; export default () => { globalThis.__manifestMounts += 1; return {} }'
    states.get('devframe:dock-renderers')!.push({ 'json-render': { importFrom: moduleUrl } })

    expect(host.context.renderers.has('json-render')).toBe(true)
    const first = await host.context.renderers.mount(jsonRenderEntry, container)
    const second = await host.context.renderers.mount(jsonRenderEntry, container)
    expect(first.status).toBe('mounted')
    expect(second.status).toBe('mounted')
    expect((globalThis as any).__manifestMounts).toBe(2)
    // The loaded module is registered like a local renderer after first use.
    expect(host.context.renderers.get('json-render')).toBeTypeOf('function')
    delete (globalThis as any).__manifestMounts
    host.dispose()
  })

  it('prefers a locally-registered renderer over the manifest', async () => {
    const { rpc, states } = createStubRpc()
    const local = vi.fn(async () => ({}))
    const host = await createDevframeClientRuntime({ rpc, renderers: { 'json-render': local } })
    states.get('devframe:dock-renderers')!.push({
      'json-render': { importFrom: 'data:text/javascript,export default () => { throw new Error("manifest module must not load") }' },
    })

    const result = await host.context.renderers.mount(jsonRenderEntry, container)
    expect(result.status).toBe('mounted')
    expect(local).toHaveBeenCalledTimes(1)
    host.dispose()
  })

  it('resolves load-error when the manifest module fails to import', async () => {
    const { rpc, states } = createStubRpc()
    const host = await createDevframeClientRuntime({ rpc })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    states.get('devframe:dock-renderers')!.push({
      'json-render': { importFrom: 'data:text/javascript,throw new Error("boom")' },
    })

    const result = await host.context.renderers.mount(jsonRenderEntry, container)
    expect(result.status).toBe('load-error')
    // The failed import is not cached - a retry re-imports the module.
    const retry = await host.context.renderers.mount(jsonRenderEntry, container)
    expect(retry.status).toBe('load-error')
    expect(error).toHaveBeenCalledTimes(2)
    error.mockRestore()
    host.dispose()
  })

  it('resolves load-error when the renderer itself throws at mount', async () => {
    const { rpc } = createStubRpc()
    const host = await createDevframeClientRuntime({
      rpc,
      renderers: { 'json-render': () => { throw new Error('mount failed') } },
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await host.context.renderers.mount(jsonRenderEntry, container)
    expect(result.status).toBe('load-error')
    error.mockRestore()
    host.dispose()
  })

  it('disposes a mounted renderer when the dock deactivates', async () => {
    const { rpc, states } = createStubRpc()
    const disposeSpy = vi.fn()
    const host = await createDevframeClientRuntime({ rpc, renderers: { 'json-render': async () => ({ dispose: disposeSpy }) } })

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
    const host = await createDevframeClientRuntime({ rpc, renderers: { 'json-render': async () => ({ dispose: disposeSpy }) } })
    await host.context.renderers.mount(jsonRenderEntry, container)
    host.dispose()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })
})
