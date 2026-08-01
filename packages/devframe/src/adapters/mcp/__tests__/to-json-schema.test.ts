import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { argsToJsonSchema, returnToJsonSchema } from '../to-json-schema'

describe('argsToJsonSchema', () => {
  it('returns an empty object schema when no args', () => {
    const { schema, unwrapped } = argsToJsonSchema(undefined)
    expect(unwrapped).toBe(false)
    expect(schema).toEqual({ type: 'object', properties: {} })
  })

  it('wraps multiple positional args under arg0/arg1/...', () => {
    const { schema, unwrapped } = argsToJsonSchema([v.string(), v.number()])
    expect(unwrapped).toBe(false)
    expect(schema).toMatchObject({
      type: 'object',
      required: ['arg0', 'arg1'],
      additionalProperties: false,
    })
    const props = (schema as any).properties
    expect(props.arg0).toMatchObject({ type: 'string' })
    expect(props.arg1).toMatchObject({ type: 'number' })
  })

  it('unwraps a single object schema for nicer agent UX', () => {
    const { schema, unwrapped } = argsToJsonSchema([
      v.object({ name: v.string(), age: v.number() }),
    ])
    expect(unwrapped).toBe(true)
    expect((schema as any).type).toBe('object')
    const props = (schema as any).properties
    expect(props.name).toBeDefined()
    expect(props.age).toBeDefined()
  })

  it('keeps arg0 shape when the single arg is a primitive', () => {
    const { schema, unwrapped } = argsToJsonSchema([v.string()])
    expect(unwrapped).toBe(false)
    expect(schema).toMatchObject({ type: 'object', required: ['arg0'] })
  })
})

describe('returnToJsonSchema', () => {
  it('returns undefined when no schema is provided', () => {
    expect(returnToJsonSchema(undefined)).toBeUndefined()
  })

  it('converts a simple schema', () => {
    const schema = returnToJsonSchema(v.object({ ok: v.boolean() }))
    expect((schema as any).type).toBe('object')
    expect((schema as any).properties.ok).toMatchObject({ type: 'boolean' })
  })
})

describe('non-valibot Standard Schemas', () => {
  // A minimal Standard Schema from a made-up vendor (mirrors zod/arktype,
  // which devframe core does not depend on) — no valibot internals.
  const foreign = {
    '~standard': {
      version: 1 as const,
      vendor: 'acme',
      validate: (value: unknown) => ({ value }),
    },
  }

  it('falls back to a permissive object per positional arg', () => {
    const { schema, unwrapped } = argsToJsonSchema([foreign, foreign])
    expect(unwrapped).toBe(false)
    expect(schema).toMatchObject({ type: 'object', required: ['arg0', 'arg1'] })
    expect((schema as any).properties.arg0).toEqual({ type: 'object', additionalProperties: true })
  })

  it('unwraps a single foreign arg to the permissive object', () => {
    const { schema, unwrapped } = argsToJsonSchema([foreign])
    expect(unwrapped).toBe(true)
    expect(schema).toEqual({ type: 'object', additionalProperties: true })
  })

  it('falls back to a permissive object schema for returns', () => {
    expect(returnToJsonSchema(foreign)).toEqual({ type: 'object', additionalProperties: true })
  })
})
