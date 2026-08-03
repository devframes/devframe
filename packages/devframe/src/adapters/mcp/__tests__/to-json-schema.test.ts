import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { argsToJsonSchema, returnToJsonSchema } from '../to-json-schema'

const PERMISSIVE = { type: 'object', additionalProperties: true }

describe('argsToJsonSchema', () => {
  it('returns an empty object schema when no args', async () => {
    const { schema, unwrapped } = await argsToJsonSchema(undefined)
    expect(unwrapped).toBe(false)
    expect(schema).toEqual({ type: 'object', properties: {} })
  })

  it('advertises each positional arg under arg0/arg1/... with precise per-vendor conversion', async () => {
    const { schema, unwrapped } = await argsToJsonSchema([v.string(), v.number()])
    expect(unwrapped).toBe(false)
    expect(schema).toMatchObject({
      type: 'object',
      required: ['arg0', 'arg1'],
      additionalProperties: false,
    })
    const props = (schema as any).properties
    // valibot vendor → precise conversion via @standard-community/standard-json.
    expect(props.arg0).toMatchObject({ type: 'string' })
    expect(props.arg1).toMatchObject({ type: 'number' })
  })

  it('falls back to a permissive object for vendors without a converter', async () => {
    const foreign = {
      '~standard': { version: 1 as const, vendor: 'acme', validate: (value: unknown) => ({ value }) },
    }
    const { schema } = await argsToJsonSchema([foreign])
    expect((schema as any).properties.arg0).toEqual(PERMISSIVE)
  })
})

describe('returnToJsonSchema', () => {
  it('returns undefined when no schema is provided', async () => {
    expect(await returnToJsonSchema(undefined)).toBeUndefined()
  })

  it('converts a declared return schema precisely for known vendors', async () => {
    const schema = await returnToJsonSchema(v.object({ ok: v.boolean() }))
    expect((schema as any).type).toBe('object')
    expect((schema as any).properties.ok).toMatchObject({ type: 'boolean' })
  })
})
