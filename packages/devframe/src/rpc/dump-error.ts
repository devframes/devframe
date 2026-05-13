import type { RpcDumpRecordError } from './types'

/**
 * Normalize a thrown value into a plain object suitable for storage in
 * a dump record. Preserves `message`, `name`, `cause`, and any own
 * enumerable properties of an `Error` so consumers reading the dump can
 * reconstruct a richer Error than just `{ message, name }`.
 *
 * Non-`Error` throws are wrapped as `{ name: 'Error', message: String(thrown) }`.
 */
export function serializeDumpError(error: unknown): RpcDumpRecordError {
  return serializeWithSeen(error, new WeakSet<object>())
}

function serializeWithSeen(error: unknown, seen: WeakSet<object>): RpcDumpRecordError {
  if (!(error instanceof Error))
    return { name: 'Error', message: String(error) }

  if (seen.has(error))
    return { name: error.name, message: error.message }
  seen.add(error)

  const out: RpcDumpRecordError = { name: error.name, message: error.message }
  const cause = (error as { cause?: unknown }).cause
  if (cause !== undefined) {
    out.cause = cause instanceof Error
      ? serializeWithSeen(cause, seen)
      : cause
  }
  for (const key of Object.keys(error)) {
    if (key === 'name' || key === 'message' || key === 'cause')
      continue
    out[key] = (error as Record<string, unknown>)[key]
  }
  return out
}

/**
 * Inverse of {@link serializeDumpError}: rebuild a thrown `Error` from
 * the plain object stored in a dump record. Preserves `cause`, restores
 * the original `name`, and re-attaches any custom own properties.
 */
export function reviveDumpError(stored: RpcDumpRecordError): Error {
  const cause = stored.cause instanceof Error
    ? stored.cause
    : isPlainErrorShape(stored.cause)
      ? reviveDumpError(stored.cause)
      : stored.cause
  const error = cause !== undefined
    ? new Error(stored.message, { cause })
    : new Error(stored.message)
  error.name = stored.name
  for (const key of Object.keys(stored)) {
    if (key === 'name' || key === 'message' || key === 'cause') {
      continue
    }
    ;(error as unknown as Record<string, unknown>)[key] = stored[key]
  }
  return error
}

function isPlainErrorShape(value: unknown): value is RpcDumpRecordError {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { message?: unknown }).message === 'string'
    && typeof (value as { name?: unknown }).name === 'string'
}
