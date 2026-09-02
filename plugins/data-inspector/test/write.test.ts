import type { WriteRequest } from '../src/engine/contract'
import { describe, expect, it } from 'vitest'
import { applyWrite } from '../src/engine/write'

const json = (value: unknown) => ({ kind: 'json', value }) as const

describe('applyWrite - set', () => {
  it('sets an object property (nested path)', () => {
    const root = { server: { port: 3000 } }
    const out = applyWrite(root, { op: 'set', path: [['k', 'server'], ['k', 'port']], value: json(8080) })
    expect(out.ok).toBe(true)
    expect(root.server.port).toBe(8080)
  })

  it('sets undefined through the discriminated payload', () => {
    const root: Record<string, unknown> = { flag: true }
    applyWrite(root, { op: 'set', path: [['k', 'flag']], value: { kind: 'undefined' } })
    expect('flag' in root).toBe(true)
    expect(root.flag).toBeUndefined()
  })

  it('sets an array item, honoring the excludeFunctions index shift', () => {
    const fn = (): void => {}
    const root = { list: [fn, 'a', 'b'] as unknown[] }
    applyWrite(root, { op: 'set', path: [['k', 'list'], ['i', 1]], value: json('B') }, { excludeFunctions: true })
    expect(root.list).toEqual([fn, 'a', 'B'])
  })

  it('sets a string-keyed Map value through a k step', () => {
    const map = new Map([['x', 1]])
    applyWrite({ map }, { op: 'set', path: [['k', 'map'], ['k', 'x']], value: json(2) })
    expect(map.get('x')).toBe(2)
  })

  it('sets a non-string-keyed Map entry value through mv', () => {
    const key = { id: 1 }
    const map = new Map<unknown, unknown>([[key, 'old']])
    applyWrite(map, { op: 'set', path: [['mv', 0]], value: json('new') })
    expect(map.get(key)).toBe('new')
  })

  it('replaces a Map key through mk, keeping the value', () => {
    const map = new Map<unknown, unknown>([[1, 'v']])
    applyWrite(map, { op: 'set', path: [['mk', 0]], value: json(2) })
    expect([...map.entries()]).toEqual([[2, 'v']])
  })

  it('replaces a Set element (delete + add)', () => {
    const set = new Set(['a', 'b'])
    applyWrite(set, { op: 'set', path: [['s', 0]], value: json('z') })
    expect([...set]).toEqual(['b', 'z'])
  })

  it('fails on frozen targets with a named error', () => {
    const root = { frozen: Object.freeze({ a: 1 }) }
    const out = applyWrite(root, { op: 'set', path: [['k', 'frozen'], ['k', 'a']], value: json(2) })
    expect(out).toMatchObject({ ok: false, error: { name: 'FrozenTarget' } })
  })

  it('fails on getter-only properties with a named error', () => {
    const root: Record<string, unknown> = {}
    Object.defineProperty(root, 'ro', { get: () => 1, enumerable: true, configurable: true })
    const out = applyWrite(root, { op: 'set', path: [['k', 'ro']], value: json(2) })
    expect(out).toMatchObject({ ok: false, error: { name: 'ReadonlyProperty' } })
  })

  it('rejects the root path', () => {
    const out = applyWrite({}, { op: 'set', path: [], value: json(1) })
    expect(out).toMatchObject({ ok: false, error: { name: 'InvalidPath' } })
  })

  it('rejects a path that falls off the graph', () => {
    const out = applyWrite({ a: 1 }, { op: 'set', path: [['k', 'nope'], ['k', 'x']], value: json(1) })
    expect(out).toMatchObject({ ok: false, error: { name: 'PathNotFound' } })
  })
})

describe('applyWrite - delete', () => {
  it('deletes an object property', () => {
    const root: Record<string, unknown> = { a: 1, b: 2 }
    applyWrite(root, { op: 'delete', path: [['k', 'a']] })
    expect(root).toEqual({ b: 2 })
  })

  it('splices an array index', () => {
    const root = { list: [1, 2, 3] }
    applyWrite(root, { op: 'delete', path: [['k', 'list'], ['i', 1]] })
    expect(root.list).toEqual([1, 3])
  })

  it('deletes a Map entry through either half (mk/mv)', () => {
    const map = new Map<unknown, unknown>([[{ id: 1 }, 'a'], [{ id: 2 }, 'b']])
    applyWrite(map, { op: 'delete', path: [['mv', 0]] })
    expect(map.size).toBe(1)
  })

  it('deletes a Set element', () => {
    const set = new Set(['a', 'b'])
    applyWrite(set, { op: 'delete', path: [['s', 1]] })
    expect([...set]).toEqual(['a'])
  })

  it('reports a missing property as PathNotFound', () => {
    const out = applyWrite({ a: 1 }, { op: 'delete', path: [['k', 'zzz']] })
    expect(out).toMatchObject({ ok: false, error: { name: 'PathNotFound' } })
  })
})

describe('applyWrite - add', () => {
  it('adds an object property (path addresses the container)', () => {
    const root: Record<string, unknown> = { nested: {} }
    applyWrite(root, { op: 'add', path: [['k', 'nested']], key: json('fresh'), value: json(1) })
    expect(root.nested).toEqual({ fresh: 1 })
  })

  it('appends to an array without a key, splices with an index key', () => {
    const root = { list: ['a', 'c'] }
    applyWrite(root, { op: 'add', path: [['k', 'list']], value: json('d') })
    applyWrite(root, { op: 'add', path: [['k', 'list']], key: json(1), value: json('b') })
    expect(root.list).toEqual(['a', 'b', 'c', 'd'])
  })

  it('adds Map entries with JSON-expressible keys', () => {
    const map = new Map<unknown, unknown>()
    applyWrite(map, { op: 'add', path: [], key: json(42), value: json('x') })
    expect(map.get(42)).toBe('x')
  })

  it('adds Set elements (no key)', () => {
    const set = new Set<unknown>()
    applyWrite(set, { op: 'add', path: [], value: json('x') })
    expect(set.has('x')).toBe(true)
  })

  it('requires a string key for object properties', () => {
    const out = applyWrite({}, { op: 'add', path: [], key: json(1), value: json('x') })
    expect(out).toMatchObject({ ok: false, error: { name: 'InvalidKey' } })
  })

  it('requires a key at all for objects and Maps', () => {
    const out = applyWrite({}, { op: 'add', path: [], value: json('x') })
    expect(out).toMatchObject({ ok: false, error: { name: 'MissingKey' } })
  })
})

describe('applyWrite - rename', () => {
  it('renames an object key atomically (renamed key lands last)', () => {
    const root: Record<string, unknown> = { a: 1, b: 2 }
    const out = applyWrite(root, { op: 'rename', path: [['k', 'a']], key: json('z') })
    expect(out.ok).toBe(true)
    expect(Object.entries(root)).toEqual([['b', 2], ['z', 1]])
  })

  it('renames a string Map key through a k step', () => {
    const map = new Map([['old', 'v']])
    applyWrite(map, { op: 'rename', path: [['k', 'old']], key: json('new') })
    expect([...map.entries()]).toEqual([['new', 'v']])
  })

  it('renames a non-string Map key through mk/mv', () => {
    const map = new Map<unknown, unknown>([[1, 'v']])
    applyWrite(map, { op: 'rename', path: [['mv', 0]], key: json(2) })
    expect([...map.entries()]).toEqual([[2, 'v']])
  })

  it('no-ops when the key is unchanged', () => {
    const root = { a: 1 }
    const out = applyWrite(root, { op: 'rename', path: [['k', 'a']], key: json('a') })
    expect(out.ok).toBe(true)
    expect(root).toEqual({ a: 1 })
  })

  it('rejects renames on unkeyed containers', () => {
    const out = applyWrite({ list: [1] }, { op: 'rename', path: [['k', 'list'], ['i', 0]], key: json('x') })
    expect(out).toMatchObject({ ok: false, error: { name: 'WrongContainer' } })
  })

  it('rejects non-string keys for object properties', () => {
    const out = applyWrite({ a: 1 }, { op: 'rename', path: [['k', 'a']], key: json(5) })
    expect(out).toMatchObject({ ok: false, error: { name: 'InvalidKey' } })
  })
})

describe('applyWrite - prototype-chain safety', () => {
  const unsafeKeys = ['__proto__', 'prototype', 'constructor'] as const

  it('rejects set of prototype-sensitive destination keys', () => {
    for (const key of unsafeKeys) {
      const root = {}
      const out = applyWrite(root, { op: 'set', path: [['k', key]], value: json({ polluted: true }) })
      expect(out).toMatchObject({ ok: false, error: { name: 'InvalidKey' } })
    }
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('rejects add of prototype-sensitive destination keys', () => {
    for (const key of unsafeKeys) {
      const out = applyWrite({}, { op: 'add', path: [], key: json(key), value: json({ polluted: true }) })
      expect(out).toMatchObject({ ok: false, error: { name: 'InvalidKey' } })
    }
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('rejects rename onto a prototype-sensitive destination key', () => {
    for (const key of unsafeKeys) {
      const root = { a: 1 }
      const out = applyWrite(root, { op: 'rename', path: [['k', 'a']], key: json(key) })
      expect(out).toMatchObject({ ok: false, error: { name: 'InvalidKey' } })
      expect(root).toEqual({ a: 1 })
    }
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('treats an inherited property as absent, reporting nested set as PathNotFound', () => {
    const proto = { shared: { secret: 1 } }
    const root = Object.create(proto) as Record<string, unknown>
    // `shared` is inherited, not an own property of `root`.
    const out = applyWrite(root, { op: 'set', path: [['k', 'shared'], ['k', 'secret']], value: json(2) })
    expect(out).toMatchObject({ ok: false, error: { name: 'PathNotFound' } })
    expect(proto.shared.secret).toBe(1)
  })

  it('treats an inherited property as absent, reporting delete/rename as PathNotFound', () => {
    const proto = { shared: 1 }
    const root = Object.create(proto) as Record<string, unknown>
    expect(applyWrite(root, { op: 'delete', path: [['k', 'shared']] })).toMatchObject({ ok: false, error: { name: 'PathNotFound' } })
    expect(applyWrite(root, { op: 'rename', path: [['k', 'shared']], key: json('renamed') })).toMatchObject({ ok: false, error: { name: 'PathNotFound' } })
    expect(proto.shared).toBe(1)
  })

  it('add creates an own data property without invoking an inherited setter', () => {
    const proto: Record<string, unknown> = {}
    let setterCalls = 0
    const bumpSetterCalls = () => setterCalls++
    Object.defineProperty(proto, 'name', { configurable: true, enumerable: true, get: () => 'proto-value', set: bumpSetterCalls })
    try {
      const root: Record<string, unknown> = Object.create(proto)
      const out = applyWrite(root, { op: 'add', path: [], key: json('name'), value: json('own-value') })
      expect(out.ok).toBe(true)
      expect(setterCalls).toBe(0)
      expect(Object.hasOwn(root, 'name')).toBe(true)
      expect(root.name).toBe('own-value')
    }
    finally {
      delete proto.name
    }
  })

  it('rename creates an own data property at the destination without invoking an inherited setter', () => {
    const proto: Record<string, unknown> = {}
    let setterCalls = 0
    const bumpSetterCalls = () => setterCalls++
    Object.defineProperty(proto, 'name', { configurable: true, enumerable: true, get: () => 'proto-value', set: bumpSetterCalls })
    try {
      const root: Record<string, unknown> = Object.create(proto)
      root.oldKey = 'own-value'
      const out = applyWrite(root, { op: 'rename', path: [['k', 'oldKey']], key: json('name') })
      expect(out.ok).toBe(true)
      expect(setterCalls).toBe(0)
      expect(Object.hasOwn(root, 'name')).toBe(true)
      expect(root.name).toBe('own-value')
    }
    finally {
      delete proto.name
    }
  })

  it('lets a Map use __proto__/prototype/constructor as ordinary data keys', () => {
    const map = new Map<unknown, unknown>()
    for (const key of unsafeKeys) {
      const out = applyWrite(map, { op: 'add', path: [], key: json(key), value: json(`value:${key}`) })
      expect(out.ok).toBe(true)
    }
    for (const key of unsafeKeys)
      expect(map.get(key)).toBe(`value:${key}`)

    expect(applyWrite(map, { op: 'set', path: [['k', '__proto__']], value: json('updated') })).toMatchObject({ ok: true })
    expect(map.get('__proto__')).toBe('updated')

    expect(applyWrite(map, { op: 'rename', path: [['k', 'prototype']], key: json('renamed-prototype') })).toMatchObject({ ok: true })
    expect(map.get('renamed-prototype')).toBe('value:prototype')
    expect(map.has('prototype')).toBe(false)
  })
})

describe('applyWrite - request typing', () => {
  it('round-trips through JSON (wire-safety of the request shape)', () => {
    const request: WriteRequest = { op: 'set', path: [['k', 'a'], ['i', 0]], value: { kind: 'undefined' } }
    const root = { a: [1] }
    const out = applyWrite(root, JSON.parse(JSON.stringify(request)) as WriteRequest)
    expect(out.ok).toBe(true)
    expect(root.a[0]).toBeUndefined()
  })
})
