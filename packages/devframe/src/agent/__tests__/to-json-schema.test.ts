import type { StandardSchemaV1 } from '@standard-schema/spec'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { argsToJsonSchema, returnToJsonSchema } from '../to-json-schema'

const PERMISSIVE = { type: 'object', additionalProperties: true }

/** A Standard Schema that also implements the Standard JSON Schema converter (like zod 4). */
function withJsonSchema(json: Record<string, unknown>): StandardSchemaV1 {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value: unknown) => ({ value }),
      jsonSchema: {
        input: () => json,
        output: () => json,
      },
    } as StandardSchemaV1['~standard'],
  }
}

describe('argsToJsonSchema', () => {
  it('returns an empty object schema when no args', () => {
    const schema = argsToJsonSchema(undefined)
    expect(schema).toEqual({ type: 'object', properties: {} })
  })

  it('uses the schema\'s own Standard JSON Schema converter when present', () => {
    const schema = argsToJsonSchema([withJsonSchema({ type: 'string' })])
    expect((schema as any).properties.arg0).toEqual({ type: 'string' })
  })

  it('falls back to a permissive object for validators without a native converter (valibot)', () => {
    const schema = argsToJsonSchema([v.string(), v.number()])
    expect((schema as any).properties.arg0).toEqual(PERMISSIVE)
    expect((schema as any).properties.arg1).toEqual(PERMISSIVE)
    expect(schema).toMatchObject({ type: 'object', required: ['arg0', 'arg1'], additionalProperties: false })
  })
})

describe('returnToJsonSchema', () => {
  it('returns undefined when no schema is provided', () => {
    expect(returnToJsonSchema(undefined)).toBeUndefined()
  })

  it('uses the native converter when present', () => {
    expect(returnToJsonSchema(withJsonSchema({ type: 'object', properties: { ok: { type: 'boolean' } } })))
      .toEqual({ type: 'object', properties: { ok: { type: 'boolean' } } })
  })

  it('falls back to permissive for validators without a native converter', () => {
    expect(returnToJsonSchema(v.object({ ok: v.boolean() }))).toEqual(PERMISSIVE)
  })
})
