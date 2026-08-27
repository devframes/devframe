/**
 * Error surface of the in-page channel. Browser-only code, so these are
 * plain coded `Error`s (structured `nostics` diagnostics are node-side
 * only): every failure mode carries a stable `code` and a message that
 * explains itself, including the endpoint status where relevant.
 */

/** Stable failure codes of the in-page channel. */
export type InPageChannelErrorCode
  /** A request/response call did not settle within `callTimeoutMs`. */
  = | 'timeout'
  /** The endpoint was closed (or closed while calls were pending). */
    | 'closed'
  /** A `jsonSerializable` payload contained a non-JSON value. */
    | 'not-serializable'
  /** The port refused to clone a payload (`DataCloneError`). */
    | 'not-cloneable'
  /** Standard-Schema validation of incoming arguments failed. */
    | 'invalid-args'
  /** A shared-state key was first accessed without its initial value. */
    | 'state-uninitialized'
  /** The panel has nowhere to send hellos and no transport. */
    | 'no-targets'

/** A coded in-page channel error. */
export class InPageChannelError extends Error {
  override name = 'InPageChannelError'
  constructor(
    /** Stable failure code. */
    public readonly code: InPageChannelErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
  }
}

const warned = new Set<string>()

/**
 * `console.warn` that fires once per distinct message — handshake noise
 * (foreign origins, version mismatches, missing targets) repeats on every
 * retry tick, so each condition warns a single time.
 */
export function warnOnce(message: string): void {
  if (warned.has(message))
    return
  warned.add(message)
  console.warn(`[devframe] ${message}`)
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function describe(value: unknown): string {
  if (typeof value === 'function')
    return 'a function'
  if (typeof value === 'symbol')
    return 'a symbol'
  if (typeof value === 'bigint')
    return 'a BigInt'
  if (value === undefined)
    return '`undefined`'
  if (value instanceof Date)
    return 'a Date'
  if (value instanceof Map)
    return 'a Map'
  if (value instanceof Set)
    return 'a Set'
  if (value instanceof RegExp)
    return 'a RegExp'
  return `an instance of ${(value as object).constructor?.name ?? 'an exotic class'}`
}

function findJsonViolation(value: unknown, path: string, seen: Set<object>): string | undefined {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return undefined
  if (typeof value === 'number')
    return Number.isFinite(value) ? undefined : `${path} is ${value}`
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || value === undefined)
    return `${path} is ${describe(value)}`
  // objects
  const obj = value as object
  if (seen.has(obj))
    return `${path} is circular`
  seen.add(obj)
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const violation = findJsonViolation(obj[i], `${path}[${i}]`, seen)
      if (violation)
        return violation
    }
    return undefined
  }
  if (!isPlainObject(obj))
    return `${path} is ${describe(obj)}`
  for (const [key, entry] of Object.entries(obj)) {
    const violation = findJsonViolation(entry, `${path}.${key}`, seen)
    if (violation)
      return violation
  }
  return undefined
}

/**
 * Enforce a `jsonSerializable: true` contract on a payload: throws an
 * `InPageChannelError` (code `not-serializable`) naming the offending path
 * when the value contains anything strict JSON can't represent — surfacing
 * the bug at the offending call instead of a silent coercion later.
 */
export function assertJsonSerializable(value: unknown, what: string, functionName: string): void {
  const violation = findJsonViolation(value, what, new Set())
  if (violation) {
    throw new InPageChannelError(
      'not-serializable',
      `in-page function "${functionName}" is declared jsonSerializable, but ${violation}`,
    )
  }
}
