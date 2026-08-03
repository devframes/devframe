import { s } from 'devframe/utils/schema'
import { describe, expect, it } from 'vitest'
import { argsToJsonSchema, returnToJsonSchema } from '../to-json-schema'

const PERMISSIVE = { type: 'object', additionalProperties: true }

describe('argsToJsonSchema', () => {
  it('returns an empty object schema when no args', () => {
    const { schema, unwrapped } = argsToJsonSchema(undefined)
    expect(unwrapped).toBe(false)
    expect(schema).toEqual({ type: 'object', properties: {} })
  })

  it('advertises each positional arg as a permissive object under arg0/arg1/...', () => {
    const { schema, unwrapped } = argsToJsonSchema([s.string(), s.number()])
    expect(unwrapped).toBe(false)
    expect(schema).toMatchObject({
      type: 'object',
      required: ['arg0', 'arg1'],
      additionalProperties: false,
    })
    const props = (schema as any).properties
    expect(props.arg0).toEqual(PERMISSIVE)
    expect(props.arg1).toEqual(PERMISSIVE)
  })

  it('wraps a single arg under arg0 (no vendor-specific unwrapping)', () => {
    const { schema, unwrapped } = argsToJsonSchema([s.object({ name: s.string() })])
    expect(unwrapped).toBe(false)
    expect(schema).toMatchObject({ type: 'object', required: ['arg0'] })
    expect((schema as any).properties.arg0).toEqual(PERMISSIVE)
  })

  it('works with any Standard Schema vendor (falls back the same way)', () => {
    const foreign = {
      '~standard': { version: 1 as const, vendor: 'acme', validate: (value: unknown) => ({ value }) },
    }
    const { schema } = argsToJsonSchema([foreign])
    expect((schema as any).properties.arg0).toEqual(PERMISSIVE)
  })
})

describe('returnToJsonSchema', () => {
  it('returns undefined when no schema is provided', () => {
    expect(returnToJsonSchema(undefined)).toBeUndefined()
  })

  it('advertises a permissive object for any declared return schema', () => {
    expect(returnToJsonSchema(s.object({ ok: s.boolean() }))).toEqual(PERMISSIVE)
  })
})
