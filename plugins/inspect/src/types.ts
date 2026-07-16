import type { AgentManifest } from 'devframe/types'

export type { AgentManifest }

/**
 * Agent-exposure projection surfaced for each RPC function. Mirrors the
 * serializable fields of `RpcFunctionAgentOptions` (the handler-free
 * subset) so the inspector can flag which functions are reachable by an
 * agent and why.
 */
export interface RpcFunctionAgentInfo {
  description: string
  title?: string
  safety?: 'read' | 'action' | 'destructive'
  tags?: readonly string[]
}

/**
 * Serializable description of a single registered RPC function. Returned
 * by `devframes:plugin:inspect:list-functions`. JSON-safe by construction
 * — valibot schemas are projected to JSON Schema (best effort), never
 * sent as live objects.
 */
export interface RpcFunctionInfo {
  /** Full namespaced function name (e.g. `my-plugin:do-thing`). */
  name: string
  /** Function type — `query`, `static`, `action`, or `event`. */
  type: 'query' | 'static' | 'action' | 'event'
  /** Whether args/return are declared strictly JSON-serializable. */
  jsonSerializable: boolean
  /** Whether the build adapter bakes a single no-args snapshot. */
  snapshot: boolean
  /** Whether results may be cached client-side. */
  cacheable: boolean
  /** Whether an args valibot schema is declared. */
  hasArgs: boolean
  /** Whether a return valibot schema is declared. */
  hasReturns: boolean
  /** Whether an explicit dump definition is declared. */
  hasDump: boolean
  /** Whether the definition has a `setup()`. */
  hasSetup: boolean
  /** Whether the definition has a top-level `handler`. */
  hasHandler: boolean
  /** Whether the inspector can invoke it (read-only `query`/`static`). */
  invokable: boolean
  /** Agent exposure, when the function declares an `agent` field. */
  agent?: RpcFunctionAgentInfo
  /** Best-effort JSON Schema of the positional args. */
  argsSchema?: unknown
  /** Best-effort JSON Schema of the return value. */
  returnsSchema?: unknown
}

/**
 * Result envelope for `devframes:plugin:inspect:invoke`. Errors are
 * normalized to a serializable shape rather than thrown so the inspector
 * UI can render failures inline alongside successes.
 */
export interface InvokeResult {
  /** `true` when the handler resolved, `false` when it threw. */
  ok: boolean
  /** Handler return value, when `ok`. Structured-clone encoded. */
  result?: unknown
  /** Normalized error, when not `ok`. */
  error?: {
    name: string
    message: string
    stack?: string
  }
  /** Wall-clock duration of the invocation in milliseconds. */
  durationMs: number
}
