import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDataSourcesService,
  getDataSource,
  listDataSources,
  onDataSourcesChanged,
  registerDataSource,
  resetDataSources,
  resolveSourceData,
  unregisterDataSource,
} from '../src/registry/index'

afterEach(() => resetDataSources())

describe('data source registry (process-global)', () => {
  it('registers, lists, gets and unregisters', () => {
    const dispose = registerDataSource({ id: 'a:x', title: 'X', data: 1 })
    expect(listDataSources()).toMatchObject([{ id: 'a:x', title: 'X', static: false }])
    expect(getDataSource('a:x')?.title).toBe('X')
    dispose()
    expect(listDataSources()).toEqual([])
  })

  it('converges across duplicate module copies via globalThis', () => {
    registerDataSource({ id: 'a:x', title: 'X', data: 1 })
    const store = (globalThis as Record<PropertyKey, unknown>)[
      Symbol.for('devframes:plugin:data-inspector:registry@1')
    ] as { entries: Map<string, unknown> }
    expect(store.entries.has('a:x')).toBe(true)
  })

  it('resolves plain values, sync factories, and async factories', async () => {
    registerDataSource({ id: 'v', title: 'v', data: { n: 1 } })
    registerDataSource({ id: 's', title: 's', data: () => ({ n: 2 }) })
    registerDataSource({ id: 'a', title: 'a', data: async () => ({ n: 3 }) })
    expect(await resolveSourceData(getDataSource('v')!)).toEqual({ n: 1 })
    expect(await resolveSourceData(getDataSource('s')!)).toEqual({ n: 2 })
    expect(await resolveSourceData(getDataSource('a')!)).toEqual({ n: 3 })
  })

  it('memoizes static factories, once', async () => {
    const factory = vi.fn(() => ({ at: Math.random() }))
    registerDataSource({ id: 'st', title: 'st', static: true, data: factory })
    const first = await resolveSourceData(getDataSource('st')!)
    const second = await resolveSourceData(getDataSource('st')!)
    expect(first).toBe(second)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('re-registering clears the static memo', async () => {
    let value = 1
    registerDataSource({ id: 'st', title: 'st', static: true, data: () => value })
    expect(await resolveSourceData(getDataSource('st')!)).toBe(1)
    value = 2
    registerDataSource({ id: 'st', title: 'st', static: true, data: () => value })
    expect(await resolveSourceData(getDataSource('st')!)).toBe(2)
  })

  it('a rejected static factory does not poison the cache', async () => {
    let fail = true
    registerDataSource({
      id: 'st',
      title: 'st',
      static: true,
      data: () => {
        if (fail)
          throw new Error('boom')
        return 'ok'
      },
    })
    await expect(resolveSourceData(getDataSource('st')!)).rejects.toThrow('boom')
    fail = false
    // The rejection eviction is scheduled on the promise; give it a tick.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(await resolveSourceData(getDataSource('st')!)).toBe('ok')
  })

  it('notifies change listeners on register/unregister and unsubscribes', () => {
    const spy = vi.fn()
    const unsubscribe = onDataSourcesChanged(spy)
    registerDataSource({ id: 'a:x', title: 'X', data: 1 })
    unregisterDataSource('a:x')
    expect(spy).toHaveBeenCalledTimes(2)
    unsubscribe()
    registerDataSource({ id: 'a:y', title: 'Y', data: 1 })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('the ctx service facade operates on the same store', () => {
    const service = createDataSourcesService()
    service.register({ id: 'svc:x', title: 'X', data: 1 })
    expect(listDataSources().map(s => s.id)).toContain('svc:x')
    service.unregister('svc:x')
    expect(listDataSources()).toEqual([])
  })
})

describe('example source', () => {
  it('registers a live, queryable playground with suggested queries', async () => {
    const { createExampleDataSource } = await import('../src/node/example-source')
    const entry = createExampleDataSource()
    registerDataSource(entry)
    const data = await resolveSourceData(getDataSource(entry.id)!)
    const { runQuery } = await import('../src/engine/query-engine')
    for (const recipe of entry.queries ?? []) {
      const out = runQuery(data, recipe.query.trim() || '$', recipe)
      expect(out.ok, `suggested query "${recipe.title}" must run`).toBe(true)
    }
  })

  it('exposes os and live process info', async () => {
    const { createExampleDataSource } = await import('../src/node/example-source')
    const entry = createExampleDataSource()
    const data = await resolveSourceData(entry) as Record<string, any>
    expect(data.os.platform).toBeTypeOf('string')
    expect(data.os.cpus.count).toBeGreaterThan(0)
    expect(data.process.memory.heapUsed).toBeGreaterThan(0)
    expect(data.process.versions.node).toBeTypeOf('string')
  })

  it('describes the devframe context when given one', async () => {
    const { createExampleDataSource } = await import('../src/node/example-source')
    const ctx = {
      cwd: '/w/app',
      workspaceRoot: '/w',
      mode: 'dev',
      rpc: { definitions: new Map([['a:fn', {}]]) },
      services: { keys: () => ['a:svc'] },
      host: { getStorageDir: (scope: string) => `/w/${scope}` },
    } as any
    const data = await resolveSourceData(createExampleDataSource(ctx)) as Record<string, any>
    expect(data.devframe).toMatchObject({
      cwd: '/w/app',
      mode: 'dev',
      rpcFunctions: ['a:fn'],
      services: ['a:svc'],
      storage: { workspace: '/w/workspace', project: '/w/project', global: '/w/global' },
    })
  })
})
