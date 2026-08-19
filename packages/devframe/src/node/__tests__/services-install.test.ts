import { describe, expect, it } from 'vitest'
import { deepMergeOptionSets, satisfiesVersionRange } from '../services-install'

describe('satisfiesVersionRange', () => {
  it('matches exact versions', () => {
    expect(satisfiesVersionRange('1.2.3', '1.2.3')).toBe(true)
    expect(satisfiesVersionRange('1.2.3', '=1.2.3')).toBe(true)
    expect(satisfiesVersionRange('1.2.4', '1.2.3')).toBe(false)
  })

  it('treats partial versions as x-ranges', () => {
    expect(satisfiesVersionRange('1.2.3', '1')).toBe(true)
    expect(satisfiesVersionRange('1.9.0', '1.x')).toBe(true)
    expect(satisfiesVersionRange('1.2.3', '1.2')).toBe(true)
    expect(satisfiesVersionRange('1.3.0', '1.2')).toBe(false)
    expect(satisfiesVersionRange('2.0.0', '1')).toBe(false)
  })

  it('supports caret ranges with npm zero-major semantics', () => {
    expect(satisfiesVersionRange('1.9.9', '^1.2.3')).toBe(true)
    expect(satisfiesVersionRange('1.2.2', '^1.2.3')).toBe(false)
    expect(satisfiesVersionRange('2.0.0', '^1.2.3')).toBe(false)
    expect(satisfiesVersionRange('0.2.5', '^0.2.3')).toBe(true)
    expect(satisfiesVersionRange('0.3.0', '^0.2.3')).toBe(false)
    expect(satisfiesVersionRange('0.0.3', '^0.0.3')).toBe(true)
    expect(satisfiesVersionRange('0.0.4', '^0.0.3')).toBe(false)
    expect(satisfiesVersionRange('2.1.0', '^2')).toBe(true)
  })

  it('supports tilde ranges', () => {
    expect(satisfiesVersionRange('1.2.9', '~1.2.3')).toBe(true)
    expect(satisfiesVersionRange('1.3.0', '~1.2.3')).toBe(false)
    expect(satisfiesVersionRange('1.9.0', '~1')).toBe(true)
  })

  it('supports ordered comparators and AND clauses', () => {
    expect(satisfiesVersionRange('2.0.0', '>=1.5')).toBe(true)
    expect(satisfiesVersionRange('1.4.9', '>=1.5')).toBe(false)
    expect(satisfiesVersionRange('2.5.0', '>=2 <3')).toBe(true)
    expect(satisfiesVersionRange('3.0.0', '>=2 <3')).toBe(false)
  })

  it('supports OR alternatives and wildcards', () => {
    expect(satisfiesVersionRange('3.1.0', '^2 || ^3')).toBe(true)
    expect(satisfiesVersionRange('4.0.0', '^2 || ^3')).toBe(false)
    expect(satisfiesVersionRange('9.9.9', '*')).toBe(true)
    expect(satisfiesVersionRange('9.9.9', 'x')).toBe(true)
  })

  it('sorts prereleases before their release', () => {
    expect(satisfiesVersionRange('1.0.0-beta.1', '>=1.0.0')).toBe(false)
    expect(satisfiesVersionRange('1.0.0-beta.1', '<1.0.0')).toBe(true)
  })

  it('reads unparseable versions as unsatisfied', () => {
    expect(satisfiesVersionRange('not-a-version', '^1')).toBe(false)
  })
})

describe('deepMergeOptionSets', () => {
  it('merges plain objects in order, later scalars win', () => {
    expect(deepMergeOptionSets([{ a: 1, b: 1 }, { b: 2, c: 3 }])).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('recurses into nested objects', () => {
    expect(deepMergeOptionSets([{ nested: { x: 1, y: 1 } }, { nested: { y: 2, z: 3 } }]))
      .toEqual({ nested: { x: 1, y: 2, z: 3 } })
  })

  it('unions + dedupes arrays', () => {
    expect(deepMergeOptionSets([{ roots: ['a', 'b'] }, { roots: ['b', 'c'] }]))
      .toEqual({ roots: ['a', 'b', 'c'] })
  })

  it('takes the later value for mismatched shapes', () => {
    expect(deepMergeOptionSets<unknown>([{ a: 1 }, ['x']])).toEqual(['x'])
    expect(deepMergeOptionSets<unknown>(['x', { a: 1 }])).toEqual({ a: 1 })
  })
})
