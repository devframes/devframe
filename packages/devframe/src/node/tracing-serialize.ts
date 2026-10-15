import type { SerializedValue } from 'devframe/types'

export interface SerializeTraceValueOptions {
  maxDepth?: number
  maxString?: number
  maxKeys?: number
}

/**
 * Flatten an arbitrary trace payload (request objects, sockets, errors,
 * cycles) into a JSON-shaped value. Never throws: anything it cannot
 * represent becomes a short placeholder string or is dropped.
 */
export function serializeTraceValue(value: unknown, options: SerializeTraceValueOptions = {}): SerializedValue {
  const { maxDepth = 4, maxString = 2000, maxKeys = 50 } = options
  const seen = new WeakSet<object>()

  function visit(input: unknown, depth: number): SerializedValue | undefined {
    switch (typeof input) {
      case 'string':
        return input.length > maxString ? `${input.slice(0, maxString)}… (${input.length - maxString} more chars)` : input
      case 'number':
        return Number.isFinite(input) ? input : String(input)
      case 'boolean':
        return input
      case 'bigint':
        return `${input}n`
      case 'undefined':
      case 'function':
      case 'symbol':
        return undefined
    }
    if (input === null)
      return null
    return visitObject(input as object, depth)
  }

  function visitObject(input: object, depth: number): SerializedValue {
    if (input instanceof Error) {
      return {
        name: input.name,
        message: input.message,
        ...(input.stack ? { stack: input.stack } : {}),
      }
    }
    if (input instanceof Date)
      return Number.isNaN(input.getTime()) ? 'Invalid Date' : input.toISOString()
    if (ArrayBuffer.isView(input))
      return `[${input.constructor.name} ${input.byteLength}]`
    if (input instanceof ArrayBuffer)
      return `[ArrayBuffer ${input.byteLength}]`

    if (seen.has(input))
      return '[Circular]'
    const isList = Array.isArray(input) || input instanceof Set || input instanceof Map
    if (depth >= maxDepth)
      return isList ? '[Array]' : '[Object]'
    seen.add(input)
    try {
      return visitChildren(input, depth)
    }
    finally {
      seen.delete(input)
    }
  }

  function visitChildren(input: object, depth: number): SerializedValue {
    if (Array.isArray(input) || input instanceof Set)
      return Array.from(input, item => visit(item, depth + 1) ?? null)
    if (input instanceof Map)
      return Array.from(input, ([k, v]) => [visit(k, depth + 1) ?? null, visit(v, depth + 1) ?? null])

    const out: { [key: string]: SerializedValue } = {}
    const keys = Object.keys(input)
    for (const key of keys.slice(0, maxKeys)) {
      let raw: unknown
      try {
        raw = (input as Record<string, unknown>)[key]
      }
      catch (error) {
        raw = error
      }
      const serialized = visit(raw, depth + 1)
      if (serialized !== undefined)
        out[key] = serialized
    }
    if (keys.length > maxKeys)
      out['…'] = `${keys.length - maxKeys} more keys`
    return out
  }

  return visit(value, 0) ?? null
}
