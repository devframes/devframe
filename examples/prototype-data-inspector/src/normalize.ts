/**
 * PROTOTYPE — throwaway code.
 *
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
 *   - depth / entry caps   -> { $truncated: ... } markers + stats
 */

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
  ignoreFunctions?: boolean
  /** Drop object properties whose key starts with `_`. */
  ignoreUnderscorePrefixed?: boolean
  /** Drop object properties whose key starts with `$`. */
  ignoreDollarPrefixed?: boolean
}

/** True when a property key is excluded by the ignore settings. */
export function isIgnoredKey(key: string, opts: Pick<NormalizeOptions, 'ignoreUnderscorePrefixed' | 'ignoreDollarPrefixed'>): boolean {
  if (opts.ignoreUnderscorePrefixed && key.startsWith('_'))
    return true
  if (opts.ignoreDollarPrefixed && key.startsWith('$'))
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
      ignoreFunctions: options.ignoreFunctions ?? false,
      ignoreUnderscorePrefixed: options.ignoreUnderscorePrefixed ?? false,
      ignoreDollarPrefixed: options.ignoreDollarPrefixed ?? false,
    },
  }
  const data = walk(value, walker, 0, '#')
  walker.stats.ms = Math.round((performance.now() - start) * 100) / 100
  return { data, stats: walker.stats }
}

function walk(value: unknown, w: Walker, depth: number, path: string): unknown {
  w.stats.nodes++

  // ── primitives ──────────────────────────────────────────────────────
  if (value === null || value === undefined)
    return value ?? null
  const t = typeof value
  if (t === 'string') {
    const s = value as string
    if (s.length > w.opts.maxString)
      return `${s.slice(0, w.opts.maxString)}… [$truncated string, ${s.length} chars]`
    return s
  }
  if (t === 'number')
    return Number.isFinite(value as number) ? value : String(value)
  if (t === 'boolean')
    return value
  if (t === 'bigint')
    return { $type: 'bigint', value: String(value) }
  if (t === 'symbol')
    return { $type: 'symbol', value: String(value) }
  if (t === 'function') {
    const fn = value as { name?: string }
    return { $type: 'function', name: fn.name || '(anonymous)' }
  }

  // ── objects ─────────────────────────────────────────────────────────
  const obj = value as object

  const seenPath = w.seen.get(obj)
  if (seenPath !== undefined) {
    w.stats.refs++
    return { $ref: seenPath }
  }

  // Cheap non-recursive exotic types first.
  if (obj instanceof Date)
    return { $type: 'Date', value: Number.isNaN(obj.getTime()) ? 'Invalid Date' : obj.toISOString() }
  if (obj instanceof RegExp)
    return { $type: 'RegExp', value: String(obj) }
  if (obj instanceof URL)
    return { $type: 'URL', value: obj.href }
  if (obj instanceof Error) {
    return { $type: 'Error', name: obj.name, message: obj.message }
  }
  if (obj instanceof Promise)
    return { $type: 'Promise' }
  for (const [ctor, tag] of OPAQUE_TAGS) {
    if (obj instanceof ctor)
      return { $type: tag }
  }

  if (depth >= w.opts.maxDepth) {
    w.stats.truncatedDepth++
    return { $truncated: 'depth', $preview: preview(obj) }
  }

  w.seen.set(obj, path)

  if (Array.isArray(obj)) {
    const source = w.opts.ignoreFunctions ? obj.filter(item => typeof item !== 'function') : obj
    const cap = Math.min(source.length, w.opts.maxEntries)
    const out: unknown[] = Array.from({ length: cap })
    for (let i = 0; i < cap; i++)
      out[i] = walk(source[i], w, depth + 1, `${path}[${i}]`)
    if (source.length > cap) {
      w.stats.truncatedEntries++
      out.push({ $truncated: 'entries', $total: source.length, $shown: cap })
    }
    return out
  }

  if (ArrayBuffer.isView(obj)) {
    const view = obj as unknown as { length?: number, byteLength: number }
    return { $type: obj.constructor?.name ?? 'TypedArray', length: view.length ?? view.byteLength }
  }

  if (obj instanceof Map) {
    const entries = [...obj.entries()].slice(0, w.opts.maxEntries)
    if (obj.size > entries.length)
      w.stats.truncatedEntries++
    const allStringKeys = entries.every(([k]) => typeof k === 'string')
    if (allStringKeys) {
      const value: Record<string, unknown> = {}
      for (const [k, v] of entries)
        value[k as string] = walk(v, w, depth + 1, `${path}.${String(k)}`)
      return { $type: 'Map', size: obj.size, value }
    }
    return {
      $type: 'Map',
      size: obj.size,
      entries: entries.map(([k, v], i) => ({
        key: walk(k, w, depth + 1, `${path}~keys[${i}]`),
        value: walk(v, w, depth + 1, `${path}~values[${i}]`),
      })),
    }
  }

  if (obj instanceof Set) {
    const values = [...obj].slice(0, w.opts.maxEntries)
    if (obj.size > values.length)
      w.stats.truncatedEntries++
    return { $type: 'Set', size: obj.size, values: values.map((v, i) => walk(v, w, depth + 1, `${path}~set[${i}]`)) }
  }

  // Plain object or class instance: own enumerable string-keyed props.
  const proto = Object.getPrototypeOf(obj)
  const className = proto && proto !== Object.prototype && proto !== null
    ? (proto.constructor?.name as string | undefined)
    : undefined

  const out: Record<string, unknown> = {}
  if (className && className !== 'Object')
    out.$class = className

  const keys = Object.keys(obj).filter(key => !isIgnoredKey(key, w.opts))
  const cap = Math.min(keys.length, w.opts.maxProps)
  for (let i = 0; i < cap; i++) {
    const key = keys[i]
    let v: unknown
    try {
      v = (obj as Record<string, unknown>)[key] // own getters may fire or throw
    }
    catch (error) {
      out[key] = { $type: 'getter-error', message: error instanceof Error ? error.message : String(error) }
      continue
    }
    if (w.opts.ignoreFunctions && typeof v === 'function')
      continue
    out[key] = walk(v, w, depth + 1, `${path}.${key}`)
  }
  if (keys.length > cap) {
    w.stats.truncatedProps++
    out.$truncated = `props: showing ${cap} of ${keys.length}`
  }
  return out
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
