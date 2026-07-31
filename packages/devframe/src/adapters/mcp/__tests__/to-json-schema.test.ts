import type { StandardSchemaV1 } from '@standard-schema/spec'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { argsToJsonSchema, returnToJsonSchema } from '../to-json-schema'

/** Minimal Standard Schema implementation that never validates, for exercising the JSON Schema dispatch. */
function fakeSchema(options: { jsonSchema?: (options: { target: string }) => unknown } = {}): StandardSchemaV1 {
  return {
    '~standard': {
      version: 1,
      vendor: 'fake',
      validate: (value: unknown) => ({ value }),
      ...(options.jsonSchema
        ? { jsonSchema: { input: options.jsonSchema, output: options.jsonSchema } }
        : {}),
    },
  } as StandardSchemaV1
}

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

  it('converts a simple valibot schema', () => {
    const schema = returnToJsonSchema(v.object({ ok: v.boolean() }))
    expect((schema as any).type).toBe('object')
    expect((schema as any).properties.ok).toMatchObject({ type: 'boolean' })
  })

  it('uses the schema\'s own Standard Schema JSON Schema converter when present', () => {
    const schema = returnToJsonSchema(fakeSchema({
      jsonSchema: () => ({ type: 'string', format: 'email' }),
    }))
    expect(schema).toEqual({ type: 'string', format: 'email' })
  })

  it('falls back to the generic object schema when no converter is available', () => {
    const schema = returnToJsonSchema(fakeSchema())
    expect(schema).toEqual({ type: 'object', additionalProperties: true })
  })

  it('falls back to the generic object schema when the converter throws', () => {
    const schema = returnToJsonSchema(fakeSchema({
      jsonSchema: () => {
        throw new Error('unsupported')
      },
    }))
    expect(schema).toEqual({ type: 'object', additionalProperties: true })
  })
})
