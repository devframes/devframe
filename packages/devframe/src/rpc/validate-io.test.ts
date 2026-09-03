import type { StandardSchemaV1 } from '@standard-schema/spec'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { defineRpcFunction } from './define'
import { getRpcHandler } from './handler'
import { validateRpcArgs, validateRpcReturn } from './validate-io'

/** A minimal async Standard Schema from a non-valibot vendor. */
function asyncPositive(): StandardSchemaV1<number, number> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      async validate(value) {
        await Promise.resolve()
        if (typeof value === 'number' && value > 0)
          return { value }
        return { issues: [{ message: 'expected a positive number' }] }
      },
    },
  }
}

describe('validateRpcArgs', () => {
  it('returns args untouched when no schema is declared', async () => {
    await expect(validateRpcArgs('fn', undefined, ['a', 1])).resolves.toEqual(['a', 1])
  })

  it('passes the original values through without rewriting them', async () => {
    // A transform would coerce to `5`; guard-only validation keeps `'hello'`.
    const schema = [v.pipe(v.string(), v.transform(s => s.length))] as const
    await expect(validateRpcArgs('fn', schema, ['hello'])).resolves.toEqual(['hello'])
  })

  it('preserves object fields beyond the schema (no key stripping)', async () => {
    const schema = [v.object({ id: v.string() })] as const
    const value = { id: 'x', extra: true }
    const [out] = await validateRpcArgs('fn', schema, [value])
    expect(out).toEqual({ id: 'x', extra: true })
  })

  it('leaves un-schema-ed trailing args in place', async () => {
    const schema = [v.string()] as const
    await expect(validateRpcArgs('fn', schema, ['a', 'passthrough'])).resolves.toEqual(['a', 'passthrough'])
  })

  it('throws DF0043 with the failing index', async () => {
    const schema = [v.string(), v.number()] as const
    await expect(validateRpcArgs('fn', schema, ['ok', 'nope'])).rejects.toThrow(/position 1/)
  })

  it('awaits async validators from any vendor', async () => {
    const schema = [asyncPositive()] as const
    await expect(validateRpcArgs('fn', schema, [3])).resolves.toEqual([3])
    await expect(validateRpcArgs('fn', schema, [-1])).rejects.toThrow(/positive number/)
  })
})

describe('validateRpcReturn', () => {
  it('passes through when no schema is declared', async () => {
    await expect(validateRpcReturn('fn', undefined, { a: 1 })).resolves.toEqual({ a: 1 })
  })

  it('returns the original value, preserving fields beyond the schema', async () => {
    // Mirrors a real plugin (terminals) whose return schema is a subset of
    // the payload; validation must not drop the undeclared field.
    const schema = v.object({ id: v.string() })
    const value = { id: 'x', restartable: false }
    await expect(validateRpcReturn('fn', schema, value)).resolves.toEqual({ id: 'x', restartable: false })
  })

  it('throws DF0044 when the return fails its schema', async () => {
    await expect(validateRpcReturn('fn', v.number(), 'not-a-number')).rejects.toThrow(/returns` schema/)
  })
})

describe('getRpcHandler validation wrapping', () => {
  it('returns the raw handler untouched when no schemas are declared', async () => {
    const original = (a: number, b: number): number => a + b
    const fn = defineRpcFunction({ name: 'add', handler: original })
    const handler = await getRpcHandler(fn, undefined)
    expect(handler).toBe(original)
    expect(handler(2, 3)).toBe(5)
  })

  it('validates args before the handler runs', async () => {
    const fn = defineRpcFunction({
      name: 'len',
      args: [v.string()],
      returns: v.number(),
      handler: (s: string) => s.length * 2,
    })
    const handler = await getRpcHandler(fn, undefined)
    await expect(handler('hello')).resolves.toBe(10)
  })

  it('rejects invalid arguments with DF0043', async () => {
    const fn = defineRpcFunction({
      name: 'greet',
      args: [v.string()],
      returns: v.string(),
      handler: (name: string) => `hi ${name}`,
    })
    const handler = await getRpcHandler(fn, undefined)
    await expect(handler(42 as never)).rejects.toThrow(/invalid argument at position 0/)
  })

  it('rejects an invalid return value with DF0044', async () => {
    const fn = defineRpcFunction({
      name: 'bad-return',
      args: [],
      returns: v.number(),
      /** Handler lies about its return type at runtime. */
      handler: () => 'not-a-number' as never,
    })
    const handler = await getRpcHandler(fn, undefined)
    await expect(handler()).rejects.toThrow(/failed its `returns` schema/)
  })

  it('works with a setup-provided handler', async () => {
    const fn = defineRpcFunction({
      name: 'setup-fn',
      args: [v.number()],
      returns: v.number(),
      setup: () => ({ handler: (n: number) => n + 1 }),
    })
    const handler = await getRpcHandler(fn, undefined)
    await expect(handler(1)).resolves.toBe(2)
    await expect(handler('x' as never)).rejects.toThrow(/position 0/)
  })
})
