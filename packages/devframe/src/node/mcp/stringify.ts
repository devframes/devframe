/**
 * JSON-coercing serializer for MCP text payloads.
 *
 * MCP carries tool results and resource reads as plain text over a
 * JSON-RPC transport, so we cannot use the `s:`-prefixed structured-clone
 * format the WS RPC transport falls back to for non-JSON values. Instead,
 * we coerce common non-JSON types into JSON-friendly forms so the LLM
 * client sees something useful instead of `[object Object]`.
 *
 * Coercions:
 *   - `BigInt` → `"123n"`
 *   - `Date` → ISO string (via the native `toJSON`)
 *   - `Map` → `{ __type: 'Map', entries: [[k, v], …] }`
 *   - `Set` → `{ __type: 'Set', entries: [v, …] }`
 *   - `Error` → `{ name, message, stack, cause? }` (cause recurses)
 *   - `Function` → `"[Function: name]"`
 *   - `Symbol` → `value.toString()`
 *   - cycles → `"[Circular]"`
 */
export function stringifyForMcp(value: unknown): string {
  if (value === undefined)
    return 'undefined'
  if (typeof value === 'string')
    return value

  const seen = new WeakSet<object>()
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'bigint')
      return `${val}n`
    if (val instanceof Error) {
      const out: Record<string, unknown> = {
        name: val.name,
        message: val.message,
        stack: val.stack,
      }
      if ((val as { cause?: unknown }).cause !== undefined)
        out.cause = (val as { cause?: unknown }).cause
      return out
    }
    if (val instanceof Map)
      return { __type: 'Map', entries: [...val.entries()] }
    if (val instanceof Set)
      return { __type: 'Set', entries: [...val] }
    if (typeof val === 'function')
      return `[Function: ${val.name || 'anonymous'}]`
    if (typeof val === 'symbol')
      return val.toString()
    if (val !== null && typeof val === 'object') {
      if (seen.has(val))
        return '[Circular]'
      seen.add(val)
    }
    return val
  }, 2)
}

/**
 * Format a thrown value for an MCP `isError` text payload. Surfaces the
 * `Error.name`/`message`, and one level of `cause.message` so context
 * isn't dropped silently.
 */
export function formatMcpError(error: unknown): string {
  if (!(error instanceof Error))
    return String(error)
  const cause = (error as { cause?: unknown }).cause
  const causeText = cause instanceof Error
    ? ` (cause: ${cause.message})`
    : cause !== undefined
      ? ` (cause: ${String(cause)})`
      : ''
  return `${error.name}: ${error.message}${causeText}`
}
