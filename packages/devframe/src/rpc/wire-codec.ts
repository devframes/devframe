import type { RpcFunctionDefinitionAny } from './types'
import { structuredCloneParse, structuredCloneStringify } from 'devframe/utils/structured-clone'
import { strictJsonStringify, STRUCTURED_CLONE_PREFIX } from './serialization'

/**
 * The per-connection `serialize`/`deserialize` pair for a live RPC wire.
 *
 * @internal
 */
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
 * encoder as its request. One codec per connection - request-id spaces
 * don't collide across connections.
 *
 * @internal
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
      // Error envelopes (`{ t: 's', i, e }`) carry a thrown value - fall back
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
 * request-id bookkeeping - used by the SSE transport to route a frame
 * (park a POST for its response / answer with a bare 202) before it is
 * handed to birpc proper.
 *
 * @internal
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
