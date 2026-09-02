/**
 * The result normalizer: walks an arbitrary live JS graph (jora query output)
 * into a plain-JSON graph safe to send over RPC and feed to discovery's
 * `struct` view. Handles what neither wire codec nor discovery can:
 *
 *   - circular refs        -> { $ref: '<path>' }
 *   - Map                  -> { $type: 'Map', size, entries | value }
 *   - Set                  -> { $type: 'Set', size, values }
 *   - functions            -> { $type: 'function', name }
 *   - class instances      -> own enumerable props + $class tag
 *   - Date / RegExp / URL  -> tagged string forms
 *   - BigInt / Symbol      -> tagged string forms
 *   - Error                -> { $type: 'Error', name, message }
 *   - Promise / WeakMap/.. -> opaque tags
 *   - depth cap            -> { $truncated: 'depth', $preview, $path } markers
 *   - entry cap            -> { $truncated: 'entries', ... } markers + stats
 *
 * Depth-truncated markers carry a `$path` (a `NodePath` of structural steps
 * from the query root) so the client can lazily re-fetch that subtree with a
 * fresh depth budget through `navigate` + `runQueryAtPath`.
 */
import type { NodePath, PathSegment } from './contract'

export interface NormalizeOptions {
  /** Max object/array nesting depth before truncation. */
  maxDepth?: number
  /** Max array items / Map+Set entries emitted per collection. */
  maxEntries?: number
  /** Max own properties emitted per object. */
  maxProps?: number
  /** Max string length before truncation. */
  maxString?: number
  /** Drop function values (object props and array items). */
  excludeFunctions?: boolean
  /** Drop object properties whose key starts with `_`. */
  excludeUnderscoreProps?: boolean
  /** Drop object properties whose key starts with `$`. */
  excludeDollarProps?: boolean
}

/** True when a property key is excluded by the filter options. */
export function isExcludedKey(key: string, opts: Pick<NormalizeOptions, 'excludeUnderscoreProps' | 'excludeDollarProps'>): boolean {
  if (opts.excludeUnderscoreProps && key.startsWith('_'))
    return true
  if (opts.excludeDollarProps && key.startsWith('$'))
    return true
  return false
}

export interface NormalizeStats {
  nodes: number
  refs: number
  truncatedDepth: number
  truncatedEntries: number
  truncatedProps: number
  ms: number
}

interface Walker {
  seen: Map<object, string>
  stats: NormalizeStats
  opts: Required<NormalizeOptions>
}

const OPAQUE_TAGS: [abstract new (...args: never[]) => unknown, string][] = []
// Guard: some of these globals may not exist in every runtime.
for (const name of ['WeakMap', 'WeakSet', 'WeakRef', 'ArrayBuffer', 'SharedArrayBuffer'] as const) {
  const ctor = (globalThis as Record<string, unknown>)[name]
  if (typeof ctor === 'function')
    OPAQUE_TAGS.push([ctor as never, name])
}

export function normalize(value: unknown, options: NormalizeOptions = {}): { data: unknown, stats: NormalizeStats } {
  const start = performance.now()
  const walker: Walker = {
    seen: new Map(),
    stats: { nodes: 0, refs: 0, truncatedDepth: 0, truncatedEntries: 0, truncatedProps: 0, ms: 0 },
    opts: {
      maxDepth: options.maxDepth ?? 8,
      maxEntries: options.maxEntries ?? 200,
      maxProps: options.maxProps ?? 150,
      maxString: options.maxString ?? 4000,
      excludeFunctions: options.excludeFunctions ?? false,
      excludeUnderscoreProps: options.excludeUnderscoreProps ?? false,
      excludeDollarProps: options.excludeDollarProps ?? false,
    },
  }
  const data = walk(value, walker, 0, '#', [])
  walker.stats.ms = Math.round((performance.now() - start) * 100) / 100
  return { data, stats: walker.stats }
}

/**
 * Re-descend a live graph along a `NodePath`, mirroring the walker's own
 * traversal (and re-applying `excludeFunctions` to array indices so a lazily
 * fetched index lines up with what the client saw). Returns the node the
 * path addresses, or `undefined` if any step falls off the graph.
 */
export function navigate(value: unknown, path: NodePath, options: Pick<NormalizeOptions, 'excludeFunctions'> = {}): unknown {
  let cur: unknown = value
  for (const [kind, at] of path) {
    if (cur === null || typeof cur !== 'object')
      return undefined
    switch (kind) {
      case 'k':
        // Own properties only - mirrors the walker, which never descends into
        // inherited properties, and keeps live re-navigation off the prototype chain.
        cur = cur instanceof Map
          ? cur.get(at)
          : Object.hasOwn(cur, at) ? (cur as Record<string, unknown>)[at] : undefined
        break
      case 'i': {
        const arr = cur as unknown[]
        const source = options.excludeFunctions ? arr.filter(item => typeof item !== 'function') : arr
        cur = source[at]
        break
      }
      case 's':
        cur = [...(cur as Set<unknown>)][at]
        break
      case 'mk':
        cur = [...(cur as Map<unknown, unknown>).entries()][at]?.[0]
        break
      case 'mv':
        cur = [...(cur as Map<unknown, unknown>).entries()][at]?.[1]
        break
    }
  }
  return cur
}

function walk(value: unknown, w: Walker, depth: number, path: string, segs: NodePath): unknown {
  w.stats.nodes++

  const primitive = walkPrimitive(value, w)
  if (primitive.handled)
    return primitive.value

  const obj = value as object

  const seenPath = w.seen.get(obj)
  if (seenPath !== undefined) {
    w.stats.refs++
    return { $ref: seenPath }
  }

  const exotic = walkExotic(obj)
  if (exotic)
    return exotic

  if (depth >= w.opts.maxDepth) {
    w.stats.truncatedDepth++
    return { $truncated: 'depth', $preview: preview(obj), $path: segs }
  }

  w.seen.set(obj, path)

  if (Array.isArray(obj))
    return walkArray(obj, w, depth, path, segs)
  if (ArrayBuffer.isView(obj))
    return walkTypedArray(obj)
  if (obj instanceof Map)
    return walkMap(obj, w, depth, path, segs)
  if (obj instanceof Set)
    return walkSet(obj, w, depth, path, segs)
  return walkObject(obj, w, depth, path, segs)
}

/** Serialize the leaf scalar/function forms; `handled: false` means recurse into the object. */
function walkPrimitive(value: unknown, w: Walker): { handled: true, value: unknown } | { handled: false } {
  if (value === null || value === undefined)
    return { handled: true, value: value ?? null }
  const t = typeof value
  if (t === 'string') {
    const s = value as string
    const out = s.length > w.opts.maxString
      ? `${s.slice(0, w.opts.maxString)}… [$truncated string, ${s.length} chars]`
      : s
    return { handled: true, value: out }
  }
  if (t === 'number')
    return { handled: true, value: Number.isFinite(value as number) ? value : String(value) }
  if (t === 'boolean')
    return { handled: true, value }
  if (t === 'bigint')
    return { handled: true, value: { $type: 'bigint', value: String(value) } }
  if (t === 'symbol')
    return { handled: true, value: { $type: 'symbol', value: String(value) } }
  if (t === 'function') {
    const fn = value as { name?: string }
    return { handled: true, value: { $type: 'function', name: fn.name || '(anonymous)' } }
  }
  return { handled: false }
}

/** Tag the cheap non-recursive exotic types, or `undefined` to keep walking. */
function walkExotic(obj: object): Record<string, unknown> | undefined {
  if (obj instanceof Date)
    return { $type: 'Date', value: Number.isNaN(obj.getTime()) ? 'Invalid Date' : obj.toISOString() }
  if (obj instanceof RegExp)
    return { $type: 'RegExp', value: String(obj) }
  if (obj instanceof URL)
    return { $type: 'URL', value: obj.href }
  if (obj instanceof Error)
    return { $type: 'Error', name: obj.name, message: obj.message }
  if (obj instanceof Promise)
    return { $type: 'Promise' }
  for (const [ctor, tag] of OPAQUE_TAGS) {
    if (obj instanceof ctor)
      return { $type: tag }
  }
  return undefined
}

function walkArray(arr: unknown[], w: Walker, depth: number, path: string, segs: NodePath): unknown[] {
  const source = w.opts.excludeFunctions ? arr.filter(item => typeof item !== 'function') : arr
  const cap = Math.min(source.length, w.opts.maxEntries)
  const out: unknown[] = Array.from({ length: cap })
  for (let i = 0; i < cap; i++)
    out[i] = walk(source[i], w, depth + 1, `${path}[${i}]`, seg(segs, ['i', i]))
  if (source.length > cap) {
    w.stats.truncatedEntries++
    out.push({ $truncated: 'entries', $total: source.length, $shown: cap })
  }
  return out
}

function walkTypedArray(obj: object): Record<string, unknown> {
  const view = obj as ArrayBufferView & { length?: number }
  return { $type: obj.constructor?.name ?? 'TypedArray', length: view.length ?? view.byteLength }
}

function walkMap(map: Map<unknown, unknown>, w: Walker, depth: number, path: string, segs: NodePath): unknown {
  const entries = [...map.entries()].slice(0, w.opts.maxEntries)
  if (map.size > entries.length)
    w.stats.truncatedEntries++
  const allStringKeys = entries.every(([k]) => typeof k === 'string')
  if (allStringKeys) {
    const value: Record<string, unknown> = {}
    for (const [k, v] of entries)
      value[k as string] = walk(v, w, depth + 1, `${path}.${String(k)}`, seg(segs, ['k', k as string]))
    return { $type: 'Map', size: map.size, value }
  }
  return {
    $type: 'Map',
    size: map.size,
    entries: entries.map(([k, v], i) => ({
      key: walk(k, w, depth + 1, `${path}~keys[${i}]`, seg(segs, ['mk', i])),
      value: walk(v, w, depth + 1, `${path}~values[${i}]`, seg(segs, ['mv', i])),
    })),
  }
}

function walkSet(set: Set<unknown>, w: Walker, depth: number, path: string, segs: NodePath): unknown {
  const values = [...set].slice(0, w.opts.maxEntries)
  if (set.size > values.length)
    w.stats.truncatedEntries++
  return { $type: 'Set', size: set.size, values: values.map((v, i) => walk(v, w, depth + 1, `${path}~set[${i}]`, seg(segs, ['s', i]))) }
}

/** Plain object or class instance: own enumerable string-keyed props. */
function walkObject(obj: object, w: Walker, depth: number, path: string, segs: NodePath): Record<string, unknown> {
  const proto = Object.getPrototypeOf(obj)
  const className = proto && proto !== Object.prototype && proto !== null
    ? (proto.constructor?.name as string | undefined)
    : undefined

  const out: Record<string, unknown> = {}
  if (className && className !== 'Object')
    out.$class = className

  const keys = Object.keys(obj).filter(key => !isExcludedKey(key, w.opts))
  const cap = Math.min(keys.length, w.opts.maxProps)
  for (let i = 0; i < cap; i++)
    walkObjectKey(obj, keys[i], w, depth, path, segs, out)
  if (keys.length > cap) {
    w.stats.truncatedProps++
    out.$truncated = `props: showing ${cap} of ${keys.length}`
  }
  return out
}

/** Read one own property (getters may throw) and walk it into `out`. */
function walkObjectKey(obj: object, key: string, w: Walker, depth: number, path: string, segs: NodePath, out: Record<string, unknown>): void {
  let v: unknown
  try {
    v = (obj as Record<string, unknown>)[key]
  }
  catch (error) {
    out[key] = { $type: 'getter-error', message: error instanceof Error ? error.message : String(error) }
    return
  }
  if (w.opts.excludeFunctions && typeof v === 'function')
    return
  out[key] = walk(v, w, depth + 1, `${path}.${key}`, seg(segs, ['k', key]))
}

/** Append one structural step to a path, returning a fresh array. */
function seg(path: NodePath, step: PathSegment): NodePath {
  return [...path, step]
}

function preview(obj: object): string {
  if (Array.isArray(obj))
    return `Array(${obj.length})`
  if (obj instanceof Map)
    return `Map(${obj.size})`
  if (obj instanceof Set)
    return `Set(${obj.size})`
  const name = obj.constructor?.name ?? 'Object'
  const keys = Object.keys(obj)
  return `${name} { ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ', …' : ''} }`
}
