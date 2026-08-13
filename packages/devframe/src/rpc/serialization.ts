import type { RpcFunctionDefinitionAny } from './types'
import { structuredCloneParse, structuredCloneStringify } from 'devframe/utils/structured-clone'
import { diagnostics } from './diagnostics'

/**
 * Wire format used by the live RPC transports (WebSocket and SSE).
 *
 * - **JSON (default, unprefixed):** payload is plain JSON text. Used when
 *   the dispatched method is declared `jsonSerializable: true`. Encoded
 *   via {@link strictJsonStringify} (rejects non-JSON values), decoded
 *   via `JSON.parse`.
 * - **Structured-clone (`s:` prefix):** payload is `s:` followed by
 *   `structured-clone-es` text. Used when the method is declared
 *   `jsonSerializable: false` (or omitted, the default). Round-trips
 *   `Map`, `Set`, `Date`, `BigInt`, cycles, and class instances.
 *
 * birpc envelopes always start with `{`, so a leading byte that is not
 * `s` is unambiguously JSON. Each direction independently chooses its
 * encoding from local definitions — request and response are not
 * coupled by a mirror rule.
 */
export const STRUCTURED_CLONE_PREFIX = 's:'

/**
 * `JSON.stringify` with a single-pass strict replacer.
 *
 * Throws `DF0020` synchronously when the value contains a type JSON
 * cannot round-trip losslessly: `Map`, `Set`, `Date`, `BigInt`, class
 * instances, or `undefined` inside an array (silently becomes `null`).
 *
 * Native pass-throughs (no extra work needed):
 *   - circular references — `JSON.stringify` raises `TypeError`.
 *   - `BigInt` at top level — caught here for a friendlier error path.
 *
 * Lenient cases (allowed without throwing):
 *   - `undefined` as an object property — legitimate optional field;
 *     JSON.stringify just omits it.
 *   - `undefined` at the root — legitimate "action returned nothing".
 *   - `Symbol` / `Function` values — semantically "drop me" in JSON.
 *
 * `fnName` is used only for the diagnostic message — pass the RPC
 * function name when calling from a wire serializer / dump writer so
 * the error points at the offending function.
 */
export function strictJsonStringify(value: unknown, fnName: string = ''): string {
  return JSON.stringify(value, function strictReplacer(this: unknown, key: string, val: unknown): unknown {
    // The replacer receives the value AFTER any `toJSON()` coercion
    // (e.g. `Date` already became an ISO string). To detect raw types,
    // peek at the holder's original property via `this[key]`. At the
    // root, `this` is the wrapper `{ '': value }` so `this['']` is the
    // raw root value.
    const holder = this as Record<string, unknown> | unknown[] | undefined
    const original = holder != null ? (holder as any)[key] : val

    if (original === undefined) {
      if (Array.isArray(holder))
        throw nonJsonAt(fnName, 'undefined', holder, key)
      return val
    }
    if (original === null)
      return val

    if (typeof original === 'bigint')
      throw nonJsonAt(fnName, 'BigInt', holder, key)

    if (typeof original === 'object') {
      if (original instanceof Map)
        throw nonJsonAt(fnName, 'Map', holder, key)
      if (original instanceof Set)
        throw nonJsonAt(fnName, 'Set', holder, key)
      if (original instanceof Date)
        throw nonJsonAt(fnName, 'Date', holder, key)
      if (Array.isArray(original))
        return val
      const proto = Object.getPrototypeOf(original)
      if (proto !== null && proto !== Object.prototype) {
        const ctorName = (original as { constructor?: { name?: string } }).constructor?.name
          ?? 'class instance'
        throw nonJsonAt(fnName, ctorName, holder, key)
      }
    }

    return val
  })
}

/** The per-connection `serialize`/`deserialize` pair for a live RPC wire. */
export interface RpcWireCodec {
  serialize: (msg: any) => string
  deserialize: (raw: string) => any
}

const EMPTY_WIRE_DEFS: ReadonlyMap<string, Pick<RpcFunctionDefinitionAny, 'jsonSerializable'>> = new Map()

/**
 * Build the per-connection wire codec every live transport (WS server, WS
 * client, SSE server, SSE client) shares: per-method dispatch between strict
 * JSON (methods declared `jsonSerializable: true`) and `s:`-prefixed
 * structured-clone (everything else, including all error envelopes), with a
 * request-id → method map so a response independently picks the same
 * encoder as its request. One codec per connection — request-id spaces
 * don't collide across connections.
 */
export function createRpcWireCodec(
  definitions: ReadonlyMap<string, Pick<RpcFunctionDefinitionAny, 'jsonSerializable'>> = EMPTY_WIRE_DEFS,
): RpcWireCodec {
  // Maps an incoming request id to its method name so the matching
  // outgoing response can look the method back up in `definitions` and
  // pick the right encoder.
  const pendingRequestMethods = new Map<string, string>()
  return {
    serialize: (msg: any): string => {
      let method: string | undefined
      if (msg.t === 'q') {
        method = msg.m
      }
      else {
        method = pendingRequestMethods.get(msg.i)
        pendingRequestMethods.delete(msg.i)
      }
      // `jsonSerializable` constrains the return-value path (args + return).
      // Error envelopes (`{ t: 's', i, e }`) carry a thrown value — fall back
      // to structured-clone so they round-trip instead of crashing the serializer.
      // Detect via `'e' in msg` so `throw undefined` still routes through SC.
      const isErrorResponse = msg.t === 's' && 'e' in msg
      const useJson = !isErrorResponse && !!method && definitions.get(method)?.jsonSerializable === true
      if (useJson)
        return strictJsonStringify(msg, method ?? '')
      return `${STRUCTURED_CLONE_PREFIX}${structuredCloneStringify(msg)}`
    },
    deserialize: (raw: string): any => {
      const msg: any = raw.startsWith(STRUCTURED_CLONE_PREFIX)
        ? structuredCloneParse(raw.slice(STRUCTURED_CLONE_PREFIX.length))
        : JSON.parse(raw)
      if (msg.t === 'q' && msg.i && msg.m)
        pendingRequestMethods.set(msg.i, msg.m)
      return msg
    },
  }
}

/**
 * Peek at a wire frame's birpc envelope without engaging a codec's
 * request-id bookkeeping — used by the SSE transport to route a frame
 * (park a POST for its response / answer with a bare 202) before it is
 * handed to birpc proper.
 */
export function peekRpcWireFrame(raw: string): { t?: string, i?: string } {
  try {
    const msg: any = raw.startsWith(STRUCTURED_CLONE_PREFIX)
      ? structuredCloneParse(raw.slice(STRUCTURED_CLONE_PREFIX.length))
      : JSON.parse(raw)
    return { t: msg?.t, i: msg?.i }
  }
  catch {
    return {}
  }
}

function nonJsonAt(fnName: string, type: string, parent: unknown, key: string): Error {
  const path = formatPath(parent, key)
  return diagnostics.DF0020({ name: fnName || '<anonymous>', type, path })
}

function formatPath(parent: unknown, key: string): string {
  if (Array.isArray(parent))
    return `[${key}]`
  if (key === '')
    return '<root>'
  return key
}
