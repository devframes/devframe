import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it } from 'vitest'
import { s } from './simple-schema'

function run<T extends StandardSchemaV1>(schema: T, value: unknown): StandardSchemaV1.Result<StandardSchemaV1.InferOutput<T>> {
  const result = schema['~standard'].validate(value)
  if (result instanceof Promise)
    throw new TypeError('unexpected async validator')
  return result
}

function accepts(schema: StandardSchemaV1, value: unknown): boolean {
  return !run(schema, value).issues
}

describe('utils/simple-schema builder', () => {
  it('produces valid Standard Schema objects', () => {
    const schema = s.string()
    expect(schema['~standard'].version).toBe(1)
    expect(schema['~standard'].vendor).toBe('devframe')
    expect(typeof schema['~standard'].validate).toBe('function')
  })

  it('validates primitives', () => {
    expect(accepts(s.string(), 'x')).toBe(true)
    expect(accepts(s.string(), 1)).toBe(false)
    expect(accepts(s.number(), 3)).toBe(true)
    expect(accepts(s.number(), Number.NaN)).toBe(false)
    expect(accepts(s.boolean(), true)).toBe(true)
    expect(accepts(s.boolean(), 'true')).toBe(false)
    expect(accepts(s.void(), undefined)).toBe(true)
    expect(accepts(s.void(), null)).toBe(false)
    expect(accepts(s.null(), null)).toBe(true)
  })

  it('handles picklist', () => {
    const schema = s.picklist(['a', 'b'] as const)
    expect(accepts(schema, 'a')).toBe(true)
    expect(accepts(schema, 'c')).toBe(false)
  })

  it('handles optional and nullable wrappers', () => {
    expect(accepts(s.optional(s.string()), undefined)).toBe(true)
    expect(accepts(s.optional(s.string()), 'x')).toBe(true)
    expect(accepts(s.optional(s.string()), 1)).toBe(false)
    expect(accepts(s.nullable(s.number()), null)).toBe(true)
    expect(accepts(s.nullable(s.number()), 2)).toBe(true)
    expect(accepts(s.nullable(s.number()), 'x')).toBe(false)
  })

  it('exposes duck-typed kind markers for CLI-flag introspection', () => {
    expect((s.boolean() as any).type).toBe('boolean')
    expect((s.optional(s.boolean()) as any).type).toBe('optional')
    expect((s.optional(s.boolean()) as any).wrapped['~standard'].vendor).toBe('devframe')
  })

  it('validates objects and reports issue paths', () => {
    const schema = s.object({ id: s.string(), count: s.number() })
    expect(accepts(schema, { id: 'x', count: 1 })).toBe(true)
    const bad = run(schema, { id: 'x', count: 'nope' })
    expect(bad.issues?.[0]?.path).toEqual(['count'])
  })

  it('keeps object keys beyond the schema (guard-only)', () => {
    const schema = s.object({ id: s.string() })
    const result = run(schema, { id: 'x', extra: true })
    expect(result.issues).toBeUndefined()
    if (!result.issues)
      expect(result.value).toEqual({ id: 'x', extra: true })
  })
})
