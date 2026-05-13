import { describe, expect, it } from 'vitest'
import { formatMcpError, stringifyForMcp } from '../stringify'

describe('stringifyForMcp', () => {
  it('returns "undefined" sentinel for undefined', () => {
    expect(stringifyForMcp(undefined)).toBe('undefined')
  })

  it('passes strings through unchanged', () => {
    expect(stringifyForMcp('hello')).toBe('hello')
  })

  it('serializes plain JSON-safe objects with indentation', () => {
    expect(stringifyForMcp({ a: 1, b: 'two' })).toBe('{\n  "a": 1,\n  "b": "two"\n}')
  })

  it('coerces BigInt to a trailing-n string', () => {
    expect(JSON.parse(stringifyForMcp({ count: 42n }))).toEqual({ count: '42n' })
  })

  it('coerces Date to ISO string via toJSON', () => {
    expect(JSON.parse(stringifyForMcp({ when: new Date(0) }))).toEqual({
      when: '1970-01-01T00:00:00.000Z',
    })
  })

  it('coerces Map to a tagged entries object', () => {
    const value = new Map<string, number>([['a', 1], ['b', 2]])
    expect(JSON.parse(stringifyForMcp(value))).toEqual({
      __type: 'Map',
      entries: [['a', 1], ['b', 2]],
    })
  })

  it('coerces Set to a tagged entries object', () => {
    const value = new Set(['x', 'y'])
    expect(JSON.parse(stringifyForMcp(value))).toEqual({
      __type: 'Set',
      entries: ['x', 'y'],
    })
  })

  it('serializes Error with name, message, stack, and cause', () => {
    const inner = new Error('inner')
    const outer = new TypeError('boom', { cause: inner })
    const parsed = JSON.parse(stringifyForMcp(outer))
    expect(parsed.name).toBe('TypeError')
    expect(parsed.message).toBe('boom')
    expect(typeof parsed.stack).toBe('string')
    expect(parsed.cause.name).toBe('Error')
    expect(parsed.cause.message).toBe('inner')
  })

  it('coerces Function to a readable token', () => {
    function namedFn() {}
    expect(JSON.parse(stringifyForMcp({ fn: namedFn }))).toEqual({
      fn: '[Function: namedFn]',
    })
  })

  it('coerces anonymous functions', () => {
    expect(JSON.parse(stringifyForMcp({ fn: () => {} }))).toEqual({
      fn: '[Function: fn]',
    })
  })

  it('coerces Symbol to its description', () => {
    expect(JSON.parse(stringifyForMcp({ s: Symbol('hi') }))).toEqual({
      s: 'Symbol(hi)',
    })
  })

  it('replaces circular refs with [Circular]', () => {
    const obj: Record<string, unknown> = { name: 'root' }
    obj.self = obj
    const parsed = JSON.parse(stringifyForMcp(obj))
    expect(parsed.name).toBe('root')
    expect(parsed.self).toBe('[Circular]')
  })

  it('handles a mixed payload end-to-end', () => {
    const value = {
      count: 42n,
      when: new Date(0),
      tags: new Set(['a', 'b']),
    }
    const text = stringifyForMcp(value)
    expect(text).toContain('"42n"')
    expect(text).toContain('1970-01-01T00:00:00.000Z')
    expect(text).toContain('"__type": "Set"')
  })
})

describe('formatMcpError', () => {
  it('returns String(value) for non-Error throws', () => {
    expect(formatMcpError('boom')).toBe('boom')
    expect(formatMcpError(42)).toBe('42')
  })

  it('formats an Error as "name: message"', () => {
    expect(formatMcpError(new TypeError('bad'))).toBe('TypeError: bad')
  })

  it('appends cause.message for Error causes', () => {
    const err = new Error('outer', { cause: new Error('inner') })
    expect(formatMcpError(err)).toBe('Error: outer (cause: inner)')
  })

  it('appends String(cause) for non-Error causes', () => {
    const err = new Error('outer', { cause: 'bad input' })
    expect(formatMcpError(err)).toBe('Error: outer (cause: bad input)')
  })
})
