import { describe, expect, it } from 'vitest'
import { normalize } from '../src/engine/normalize'
import { runQuery, suggest } from '../src/engine/query-engine'
import { skeletonOf } from '../src/engine/skeleton'

class Store {
  name = 'sessions'
  entries = new Map<string, { hits: number }>([['a', { hits: 3 }], ['b', { hits: 7 }]])
  get upper(): string {
    return this.name.toUpperCase()
  }
}

function liveGraph() {
  const parent: Record<string, unknown> = { name: 'parent' }
  parent.self = parent
  return {
    store: new Store(),
    tags: new Set(['alpha', 'beta']),
    when: new Date('2026-01-01T00:00:00Z'),
    big: 10n,
    fn: () => 'x',
    circular: parent,
    list: Array.from({ length: 500 }, (_, i) => i),
  }
}

describe('normalize', () => {
  it('produces strict JSON from a hostile live graph', () => {
    const { data, stats } = normalize(liveGraph(), { maxEntries: 50 })
    const text = JSON.stringify(data)
    expect(text).toBeTypeOf('string')
    expect(JSON.parse(text)).toBeTruthy()
    expect(stats.refs).toBe(1)
    expect(stats.truncatedEntries).toBeGreaterThan(0)
  })

  it('tags exotic values and marks circulars', () => {
    const { data } = normalize(liveGraph()) as { data: any }
    expect(data.store.$class).toBe('Store')
    expect(data.store.entries.$type).toBe('Map')
    expect(data.tags).toMatchObject({ $type: 'Set', size: 2 })
    expect(data.when.$type).toBe('Date')
    expect(data.big).toMatchObject({ $type: 'bigint', value: '10' })
    expect(data.fn.$type).toBe('function')
    expect(JSON.stringify(data.circular)).toContain('$ref')
  })

  it('honors filter options', () => {
    const input = { keep: 1, _private: 2, $meta: 3, fn: () => {} }
    const { data } = normalize(input, {
      excludeFunctions: true,
      excludeUnderscoreProps: true,
      excludeDollarProps: true,
    }) as { data: Record<string, unknown> }
    expect(Object.keys(data)).toEqual(['keep'])
  })
})

describe('runQuery (live)', () => {
  it('queries live Maps and Sets through the bridge methods', () => {
    const out = runQuery(liveGraph(), 'store.entries.mapEntries().key')
    expect(out).toMatchObject({ ok: true, result: ['a', 'b'] })
    const set = runQuery(liveGraph(), 'tags.fromSet()')
    expect(set).toMatchObject({ ok: true, result: ['alpha', 'beta'] })
  })

  it('reports payload size and timings', () => {
    const out = runQuery(liveGraph(), 'store.name')
    expect(out.ok && out.stats.payloadBytes).toBeGreaterThan(0)
  })

  it('fails soft with an error envelope', () => {
    const out = runQuery(liveGraph(), 'nope.method()')
    expect(out.ok).toBe(false)
  })
})

describe('runQuery (static portability)', () => {
  it('the same query works against the NORMALIZED form of the data', () => {
    const { data } = normalize(liveGraph())
    // `store.entries` is now a `{ $type: 'Map', value }` tag; the bridge
    // methods duck-type it so live-authored queries stay portable.
    const out = runQuery(data, 'store.entries.mapEntries().key')
    expect(out).toMatchObject({ ok: true, result: ['a', 'b'] })
    const set = runQuery(data, 'tags.fromSet()')
    expect(set).toMatchObject({ ok: true, result: ['alpha', 'beta'] })
  })
})

describe('suggest', () => {
  it('returns flattened, prefix-ranged completion items', () => {
    const out = suggest({ foo: { bar: 1, baz: 2 } }, 'foo.', 4)
    expect(out.ok).toBe(true)
    expect(out.suggestions.map(s => s.value)).toEqual(['bar', 'baz'])
    expect(out.suggestions[0]).toMatchObject({ from: 4, to: 4, current: '' })
  })
})

describe('skeletonOf', () => {
  it('captures shape without values, expanding shared refs but not cycles', () => {
    const shared = { deep: 1 }
    const parent: Record<string, unknown> = { shared1: shared, shared2: shared }
    parent.self = parent
    const { skeleton } = skeletonOf(parent) as { skeleton: any }
    expect(skeleton.shared1).toEqual({ deep: 'number' })
    expect(skeleton.shared2).toEqual({ deep: 'number' })
    expect(skeleton.self).toBe('[circular]')
  })

  it('labels collections with sizes', () => {
    const { skeleton } = skeletonOf(liveGraph()) as { skeleton: any }
    expect(Object.keys(skeleton.store).includes('$class')).toBe(true)
    expect(JSON.stringify(skeleton.store)).toContain('Map(2)')
    expect(JSON.stringify(skeleton.tags)).toContain('Set(2)')
  })
})
