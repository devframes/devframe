import { describe, expect, it } from 'vitest'
import { navigate, normalize } from '../src/engine/normalize'
import { runQuery, runQueryAtPath, suggest } from '../src/engine/query-engine'
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

describe('depth truncation + lazy expand', () => {
  // A graph deeper than a tiny maxDepth so the walker truncates partway.
  function deep() {
    return {
      level0: {
        level1: {
          level2: {
            level3: { leaf: 'found', more: [1, 2, 3] },
          },
        },
      },
    }
  }

  it('marks depth-truncated nodes with a re-fetchable $path', () => {
    const { data, stats } = normalize(deep(), { maxDepth: 2 }) as { data: any, stats: any }
    expect(stats.truncatedDepth).toBeGreaterThan(0)
    const marker = data.level0.level1
    expect(marker.$truncated).toBe('depth')
    expect(marker.$path).toEqual([['k', 'level0'], ['k', 'level1']])
  })

  it('navigate() re-descends a live graph along a node path', () => {
    const g = deep()
    expect(navigate(g, [['k', 'level0'], ['k', 'level1'], ['k', 'level2']])).toBe(g.level0.level1.level2)
    expect(navigate(g, [['k', 'nope']])).toBeUndefined()
  })

  it('navigate() re-applies excludeFunctions to array indices', () => {
    const g = { list: [() => {}, { keep: 1 }, () => {}, { keep: 2 }] }
    // With functions filtered out, display index 1 is the { keep: 2 } object.
    expect(navigate(g, [['k', 'list'], ['i', 1]], { excludeFunctions: true })).toEqual({ keep: 2 })
    // Without filtering, display index 1 is the first plain object.
    expect(navigate(g, [['k', 'list'], ['i', 1]])).toEqual({ keep: 1 })
  })

  it('navigate() handles Set and non-string-keyed Map steps', () => {
    const key = { id: 1 }
    const g = { tags: new Set(['a', 'b']), map: new Map<unknown, unknown>([[key, 'v']]) }
    expect(navigate(g, [['k', 'tags'], ['s', 1]])).toBe('b')
    expect(navigate(g, [['k', 'map'], ['mk', 0]])).toBe(key)
    expect(navigate(g, [['k', 'map'], ['mv', 0]])).toBe('v')
  })

  it('runQueryAtPath re-runs and returns a fresh slice of the subtree', () => {
    const out = runQueryAtPath(deep(), '$', [['k', 'level0'], ['k', 'level1']], { maxDepth: 3 })
    expect(out.ok).toBe(true)
    if (out.ok) {
      // The subtree normalizes from level2 with a fresh budget, reaching the leaf.
      expect(out.result).toMatchObject({ level2: { level3: { leaf: 'found' } } })
    }
  })

  it('runQueryAtPath fails soft on a broken base query', () => {
    expect(runQueryAtPath(deep(), 'nope.method()', []).ok).toBe(false)
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
