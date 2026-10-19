import { Socket } from 'node:net'
import { describe, expect, it } from 'vitest'
import { serializeTraceValue } from '../tracing-serialize'

describe('serializeTraceValue', () => {
  it('passes primitives through and stringifies the ones JSON cannot hold', () => {
    expect(serializeTraceValue({ a: 1, b: 'x', c: true, d: null, e: 10n, f: Number.NaN }))
      .toEqual({ a: 1, b: 'x', c: true, d: null, e: '10n', f: 'NaN' })
  })

  it('drops functions, symbols and undefined from objects, nulls them in arrays', () => {
    expect(serializeTraceValue({ fn() {}, sym: Symbol('s'), u: undefined, list: [() => 1, undefined, 2] }))
      .toEqual({ list: [null, null, 2] })
    expect(serializeTraceValue(() => 1)).toBeNull()
  })

  it('caps depth and marks cycles only for true cycles', () => {
    const shared = { leaf: 1 }
    const cyclic: Record<string, unknown> = { shared, again: shared }
    cyclic.self = cyclic
    expect(serializeTraceValue(cyclic)).toEqual({
      shared: { leaf: 1 },
      again: { leaf: 1 },
      self: '[Circular]',
    })
    expect(serializeTraceValue({ a: { b: { c: { d: { e: 1 } } } } }, { maxDepth: 3 }))
      .toEqual({ a: { b: { c: '[Object]' } } })
    expect(serializeTraceValue([[[[1]]]], { maxDepth: 2 })).toEqual([['[Array]']])
  })

  it('truncates long strings and wide objects', () => {
    const long = 'x'.repeat(10)
    expect(serializeTraceValue(long, { maxString: 4 })).toBe('xxxx… (6 more chars)')
    const wide = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`k${i}`, i]))
    expect(serializeTraceValue(wide, { maxKeys: 2 })).toEqual({ 'k0': 0, 'k1': 1, '…': '3 more keys' })
  })

  it('represents errors, dates, maps, sets and binary data', () => {
    const error = new TypeError('boom')
    const out = serializeTraceValue({
      error,
      date: new Date('2026-01-02T03:04:05.000Z'),
      map: new Map([['k', { v: 1 }]]),
      set: new Set([1, 2]),
      bytes: new Uint8Array(3),
      buffer: new ArrayBuffer(8),
    }) as Record<string, unknown>
    expect(out.error).toMatchObject({ name: 'TypeError', message: 'boom' })
    expect((out.error as { stack: string }).stack).toContain('boom')
    expect(out.date).toBe('2026-01-02T03:04:05.000Z')
    expect(out.map).toEqual([['k', { v: 1 }]])
    expect(out.set).toEqual([1, 2])
    expect(out.bytes).toBe('[Uint8Array 3]')
    expect(out.buffer).toBe('[ArrayBuffer 8]')
  })

  it('never throws on a request-like object holding a socket and a throwing getter', () => {
    const socket = new Socket()
    const request = {
      method: 'GET',
      url: '/x',
      socket,
      get poison(): never {
        throw new Error('no access')
      },
    }
    const out = serializeTraceValue(request) as Record<string, unknown>
    expect(out.method).toBe('GET')
    expect(typeof out.socket).toBe('object')
    expect(out.poison).toMatchObject({ name: 'Error', message: 'no access' })
    socket.destroy()
  })
})
