import { describe, expect, it } from 'vitest'
import { parseNamespacedName } from '../src/spa/utils/color'

describe('parseNamespacedName', () => {
  it('splits a single `:` namespace into a colored prefix and an uncolored leaf', () => {
    const segments = parseNamespacedName('foo:bar')
    expect(segments).toEqual([
      { text: 'foo', separator: ':', isLeaf: false, color: expect.any(String) },
      { text: 'bar', separator: '', isLeaf: true, color: undefined },
    ])
  })

  it('splits deep `:` namespaces, coloring every namespace segment', () => {
    const segments = parseNamespacedName('devframes:plugin:inspect:list-functions')
    expect(segments.map(s => s.text)).toEqual(['devframes', 'plugin', 'inspect', 'list-functions'])
    expect(segments.map(s => s.separator)).toEqual([':', ':', ':', ''])
    expect(segments.map(s => s.isLeaf)).toEqual([false, false, false, true])
    // Every namespace gets a color; only the leaf is uncolored.
    expect(segments.slice(0, 3).every(s => typeof s.color === 'string')).toBe(true)
    expect(segments.at(-1)!.color).toBeUndefined()
  })

  it('splits on `/` as well as `:`, preserving the actual separator', () => {
    const segments = parseNamespacedName('vite:rolldown:chunks/list')
    expect(segments.map(s => s.text)).toEqual(['vite', 'rolldown', 'chunks', 'list'])
    expect(segments.map(s => s.separator)).toEqual([':', ':', '/', ''])
  })

  it('treats a name with no separator as a single uncolored leaf', () => {
    expect(parseNamespacedName('refresh')).toEqual([
      { text: 'refresh', separator: '', isLeaf: true, color: undefined },
    ])
  })

  it('round-trips: concatenating text + separator reproduces the original name', () => {
    for (const name of ['a:b', 'a/b', 'a:b/c:d', 'solo', 'x:y:z']) {
      const rebuilt = parseNamespacedName(name)
        .map(s => s.text + s.separator)
        .join('')
      expect(rebuilt).toBe(name)
    }
  })

  it('colors the same namespace path deterministically', () => {
    const a = parseNamespacedName('vite:rolldown:list')
    const b = parseNamespacedName('vite:rolldown:other')
    // `vite` and `vite:rolldown` resolve to identical colors across names.
    expect(a[0].color).toBe(b[0].color)
    expect(a[1].color).toBe(b[1].color)
  })
})
