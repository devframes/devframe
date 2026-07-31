/**
 * The write applier: mutate a live object graph in place along a `NodePath`.
 *
 * Ops are container-generic on the wire (`set` / `delete` / `add` / `rename`);
 * this module resolves the path with the same descent semantics as the
 * normalizer's `navigate` (filter options shift array indices) and dispatches
 * on the container it finds — plain object, array, Map, or Set. Every failure
 * returns a named error outcome; nothing here throws.
 */
import type { NodePath, PathSegment, WriteOutcome, WriteRequest, WriteValue } from './contract'
import { navigate } from './normalize'

export interface WriteApplyOptions {
  /** Must match the client's view so `['i', n]` indices line up. */
  excludeFunctions?: boolean
}

class WriteError extends Error {
  constructor(name: string, message: string) {
    super(message)
    this.name = name
  }
}

/** Decode a discriminated wire value into the raw JS value to write. */
function decode(value: WriteValue): unknown {
  return value.kind === 'undefined' ? undefined : value.value
}

/** A JSON-expressible Map key / Set element (string-coerced object keys aside). */
function decodeKey(value: WriteValue | undefined, op: string): unknown {
  if (!value)
    throw new WriteError('MissingKey', `"${op}" needs a key`)
  return decode(value)
}

/** Map a filtered array index back onto the real one (mirrors `navigate`). */
function realIndex(arr: unknown[], filtered: number, opts: WriteApplyOptions): number {
  if (!opts.excludeFunctions)
    return filtered
  let seen = -1
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] === 'function')
      continue
    seen++
    if (seen === filtered)
      return i
  }
  return -1
}

function entryAt(map: Map<unknown, unknown>, index: number): [unknown, unknown] {
  const entry = [...map.entries()][index]
  if (!entry)
    throw new WriteError('PathNotFound', `Map entry ${index} does not exist`)
  return entry
}

function elementAt(set: Set<unknown>, index: number): unknown {
  const values = [...set]
  if (index < 0 || index >= values.length)
    throw new WriteError('PathNotFound', `Set element ${index} does not exist`)
  return values[index]
}

function assertMutableObject(target: object): void {
  if (Object.isFrozen(target))
    throw new WriteError('FrozenTarget', 'the target object is frozen')
}

/** Resolve the container a path's final segment applies to. */
function resolveParent(root: unknown, path: NodePath, opts: WriteApplyOptions): object {
  const parent = navigate(root, path.slice(0, -1), opts)
  if (parent === null || typeof parent !== 'object')
    throw new WriteError('PathNotFound', 'the path does not resolve to a container')
  return parent
}

function setAt(parent: object, seg: PathSegment, value: unknown, opts: WriteApplyOptions): void {
  const [kind, at] = seg
  switch (kind) {
    case 'k': {
      if (parent instanceof Map) {
        parent.set(at, value)
        return
      }
      assertMutableObject(parent)
      const key = at as string
      const desc = Object.getOwnPropertyDescriptor(parent, key)
      if (desc && !desc.writable && !desc.set)
        throw new WriteError('ReadonlyProperty', `property "${key}" has no setter`)
      const record = parent as Record<string, unknown>
      record[key] = value
      return
    }
    case 'i': {
      if (!Array.isArray(parent))
        throw new WriteError('WrongContainer', 'an index step needs an array')
      const index = realIndex(parent, at as number, opts)
      if (index < 0 || index >= parent.length)
        throw new WriteError('PathNotFound', `array index ${at} does not exist`)
      parent[index] = value
      return
    }
    case 's': {
      if (!(parent instanceof Set))
        throw new WriteError('WrongContainer', 'a set step needs a Set')
      // A Set has no positional assignment: replace = delete + add.
      parent.delete(elementAt(parent, at as number))
      parent.add(value)
      return
    }
    case 'mk': {
      if (!(parent instanceof Map))
        throw new WriteError('WrongContainer', 'a map-key step needs a Map')
      const [oldKey, entryValue] = entryAt(parent, at as number)
      parent.delete(oldKey)
      parent.set(value, entryValue)
      return
    }
    case 'mv': {
      if (!(parent instanceof Map))
        throw new WriteError('WrongContainer', 'a map-value step needs a Map')
      const [key] = entryAt(parent, at as number)
      parent.set(key, value)
    }
  }
}

function deleteAt(parent: object, seg: PathSegment, opts: WriteApplyOptions): void {
  const [kind, at] = seg
  switch (kind) {
    case 'k': {
      if (parent instanceof Map) {
        if (!parent.delete(at))
          throw new WriteError('PathNotFound', `Map key "${at}" does not exist`)
        return
      }
      assertMutableObject(parent)
      const key = at as string
      if (!Object.hasOwn(parent, key))
        throw new WriteError('PathNotFound', `property "${key}" does not exist`)
      if (!delete (parent as Record<string, unknown>)[key])
        throw new WriteError('ReadonlyProperty', `property "${key}" cannot be deleted`)
      return
    }
    case 'i': {
      if (!Array.isArray(parent))
        throw new WriteError('WrongContainer', 'an index step needs an array')
      const index = realIndex(parent, at as number, opts)
      if (index < 0 || index >= parent.length)
        throw new WriteError('PathNotFound', `array index ${at} does not exist`)
      parent.splice(index, 1)
      return
    }
    case 's': {
      if (!(parent instanceof Set))
        throw new WriteError('WrongContainer', 'a set step needs a Set')
      parent.delete(elementAt(parent, at as number))
      return
    }
    // Deleting either half of a Map entry removes the entry.
    case 'mk':
    case 'mv': {
      if (!(parent instanceof Map))
        throw new WriteError('WrongContainer', 'a map-entry step needs a Map')
      const [key] = entryAt(parent, at as number)
      parent.delete(key)
    }
  }
}

function addTo(container: object, key: WriteValue | undefined, value: unknown, opts: WriteApplyOptions): void {
  if (container instanceof Map) {
    container.set(decodeKey(key, 'add'), value)
    return
  }
  if (container instanceof Set) {
    container.add(value)
    return
  }
  if (Array.isArray(container)) {
    const rawIndex = key ? decode(key) : undefined
    if (rawIndex === undefined) {
      container.push(value)
      return
    }
    if (typeof rawIndex !== 'number' || !Number.isInteger(rawIndex))
      throw new WriteError('InvalidKey', 'an array insertion index must be an integer')
    const index = realIndex(container, rawIndex, opts)
    container.splice(index < 0 ? container.length : index, 0, value)
    return
  }
  assertMutableObject(container)
  const propKey = decodeKey(key, 'add')
  if (typeof propKey !== 'string')
    throw new WriteError('InvalidKey', 'an object property key must be a string')
  const record = container as Record<string, unknown>
  record[propKey] = value
}

function renameAt(parent: object, seg: PathSegment, newKey: unknown): void {
  const [kind, at] = seg
  if (kind === 'k' && parent instanceof Map) {
    if (!parent.has(at))
      throw new WriteError('PathNotFound', `Map key "${at}" does not exist`)
    if (newKey === at)
      return
    const value = parent.get(at)
    parent.delete(at)
    parent.set(newKey, value)
    return
  }
  if (kind === 'k') {
    assertMutableObject(parent)
    const key = at as string
    if (!Object.hasOwn(parent, key))
      throw new WriteError('PathNotFound', `property "${key}" does not exist`)
    if (typeof newKey !== 'string')
      throw new WriteError('InvalidKey', 'an object property key must be a string')
    if (newKey === key)
      return
    const value = (parent as Record<string, unknown>)[key]
    delete (parent as Record<string, unknown>)[key]
    ;(parent as Record<string, unknown>)[newKey] = value
    return
  }
  if (kind === 'mk' || kind === 'mv') {
    if (!(parent instanceof Map))
      throw new WriteError('WrongContainer', 'a map-entry step needs a Map')
    const [oldKey, value] = entryAt(parent, at as number)
    if (newKey === oldKey)
      return
    parent.delete(oldKey)
    parent.set(newKey, value)
    return
  }
  throw new WriteError('WrongContainer', 'only keyed entries (objects, Maps) can be renamed')
}

/**
 * Apply one write request to a live root object. Mutates in place;
 * returns a named error outcome instead of throwing.
 */
export function applyWrite(root: unknown, request: WriteRequest, options: WriteApplyOptions = {}): WriteOutcome {
  try {
    if (request.op === 'add') {
      // `add` addresses the container itself, not a node inside it.
      const container = navigate(root, request.path, options)
      if (container === null || typeof container !== 'object')
        throw new WriteError('PathNotFound', 'the path does not resolve to a container')
      addTo(container, request.key, decode(request.value), options)
      return { ok: true }
    }
    if (request.path.length === 0)
      throw new WriteError('InvalidPath', 'the root itself cannot be replaced, deleted, or renamed')
    const parent = resolveParent(root, request.path, options)
    const seg = request.path[request.path.length - 1]
    switch (request.op) {
      case 'set':
        setAt(parent, seg, decode(request.value), options)
        break
      case 'delete':
        deleteAt(parent, seg, options)
        break
      case 'rename':
        renameAt(parent, seg, decode(request.key))
        break
    }
    return { ok: true }
  }
  catch (error) {
    const e = error instanceof Error ? error : new Error(String(error))
    return { ok: false, error: { name: e.name, message: e.message } }
  }
}
