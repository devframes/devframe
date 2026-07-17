/**
 * "What data are available": walks a live object into a compact type
 * SKELETON (keys and type names, no values) so users can see the shape of a
 * source while composing queries — independent of any query.
 *
 *   - primitives           -> their type name ('string', 'number', ...)
 *   - functions            -> 'function'
 *   - arrays               -> [skeleton of first item, '+N more']
 *   - Map/Set (incl. -like)-> 'Map(size) { <key> => <value> }' expansions
 *   - class instances      -> own props + $class tag
 *   - circular             -> '[circular]'
 *   - depth/prop caps      -> '...'
 */
import type { NormalizeOptions } from './normalize'
import { isExcludedKey } from './normalize'

export type SkeletonOptions = Pick<
  NormalizeOptions,
  'maxDepth' | 'maxProps' | 'excludeFunctions' | 'excludeUnderscoreProps' | 'excludeDollarProps'
>

interface SkeletonWalker {
  seen: WeakSet<object>
  nodes: number
  opts: Required<SkeletonOptions>
}

export function skeletonOf(value: unknown, options: SkeletonOptions = {}): { skeleton: unknown, nodes: number, ms: number } {
  const started = performance.now()
  const walker: SkeletonWalker = {
    seen: new WeakSet(),
    nodes: 0,
    opts: {
      maxDepth: options.maxDepth ?? 5,
      maxProps: options.maxProps ?? 80,
      excludeFunctions: options.excludeFunctions ?? false,
      excludeUnderscoreProps: options.excludeUnderscoreProps ?? false,
      excludeDollarProps: options.excludeDollarProps ?? false,
    },
  }
  const skeleton = walk(value, walker, 0)
  return { skeleton, nodes: walker.nodes, ms: Math.round((performance.now() - started) * 100) / 100 }
}

function isMapLike(v: object): v is Map<unknown, unknown> {
  return typeof (v as Map<unknown, unknown>).entries === 'function'
    && typeof (v as Map<unknown, unknown>).get === 'function'
    && typeof (v as Map<unknown, unknown>).size === 'number'
}

function isSetLike(v: object): v is Set<unknown> {
  return typeof (v as Set<unknown>).has === 'function'
    && typeof (v as Set<unknown>)[Symbol.iterator] === 'function'
    && typeof (v as Map<unknown, unknown>).get !== 'function'
    && typeof (v as Set<unknown>).size === 'number'
}

function walk(value: unknown, w: SkeletonWalker, depth: number): unknown {
  w.nodes++
  if (value === null || value === undefined)
    return String(value)
  const t = typeof value
  if (t !== 'object')
    return t // 'string' | 'number' | 'boolean' | 'bigint' | 'symbol' | 'function'

  const obj = value as object
  if (obj instanceof Date)
    return 'Date'
  if (obj instanceof RegExp)
    return 'RegExp'
  if (obj instanceof URL)
    return 'URL'
  if (obj instanceof Error)
    return 'Error'
  if (obj instanceof Promise)
    return 'Promise'

  if (w.seen.has(obj))
    return '[circular]'
  if (depth >= w.opts.maxDepth)
    return '...'
  // Ancestor-path tracking (add/delete) so SHARED refs still expand and only
  // true cycles collapse to '[circular]'.
  w.seen.add(obj)
  try {
    return walkObject(obj, w, depth)
  }
  finally {
    w.seen.delete(obj)
  }
}

function walkObject(obj: object, w: SkeletonWalker, depth: number): unknown {
  if (Array.isArray(obj)) {
    const items = w.opts.excludeFunctions ? obj.filter(item => typeof item !== 'function') : obj
    if (items.length === 0)
      return []
    const first = walk(items[0], w, depth + 1)
    return items.length > 1 ? [first, `+${items.length - 1} more`] : [first]
  }

  if (ArrayBuffer.isView(obj))
    return obj.constructor?.name ?? 'TypedArray'

  if (isMapLike(obj)) {
    const first = obj.entries().next().value as [unknown, unknown] | undefined
    if (!first)
      return `Map(0)`
    return {
      [`Map(${obj.size})`]: {
        key: walk(first[0], w, depth + 1),
        value: walk(first[1], w, depth + 1),
      },
    }
  }

  if (isSetLike(obj)) {
    const first = obj[Symbol.iterator]().next().value
    return first === undefined
      ? `Set(0)`
      : { [`Set(${obj.size})`]: walk(first, w, depth + 1) }
  }

  const proto = Object.getPrototypeOf(obj)
  const className = proto && proto !== Object.prototype ? (proto.constructor?.name as string | undefined) : undefined

  const out: Record<string, unknown> = {}
  if (className && className !== 'Object')
    out.$class = className

  const keys = Object.keys(obj).filter(key => !isExcludedKey(key, w.opts))
  const cap = Math.min(keys.length, w.opts.maxProps)
  for (let i = 0; i < cap; i++) {
    const key = keys[i]
    let v: unknown
    try {
      v = (obj as Record<string, unknown>)[key]
    }
    catch {
      out[key] = 'getter-error'
      continue
    }
    if (w.opts.excludeFunctions && typeof v === 'function')
      continue
    out[key] = walk(v, w, depth + 1)
  }
  if (keys.length > cap)
    out['...'] = `+${keys.length - cap} more props`
  return out
}
