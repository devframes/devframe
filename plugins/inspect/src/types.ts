import type { AgentManifest } from 'devframe'

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
 * - Standard Schema args/return schemas are projected to JSON Schema (best
 * effort), never sent as live objects.
 */
export interface RpcFunctionInfo {
  /** Full namespaced function name (e.g. `my-plugin:do-thing`). */
  name: string
  /** Function type - `query`, `static`, `action`, or `event`. */
  type: 'query' | 'static' | 'action' | 'event'
  /** Whether args/return are declared strictly JSON-serializable. */
  jsonSerializable: boolean
  /** Whether the build adapter bakes a single no-args snapshot. */
  snapshot: boolean
  /** Whether results may be cached client-side. */
  cacheable: boolean
  /** Whether an args schema is declared. */
  hasArgs: boolean
  /** Whether a return schema is declared. */
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
 * Serializable projection of a single command registered on a hub's
 * commands host (`DevframeServerCommandEntry`/`DevframeCommandBase` in
 * `@devframes/hub`), returned by `devframes:plugin:inspect:list-commands`.
 * Populated only when this connection is mounted inside a hub - a plain
 * devframe connection (no hub) returns an empty list.
 */
export interface DevframeInspectCommandInfo {
  /** Unique namespaced command id, e.g. `"vite:open-in-editor"`. */
  id: string
  title: string
  description?: string
  /** Iconify icon string, or a theme-specific `{ light, dark }` pair. */
  icon?: string | { light: string, dark: string }
  category?: string
  /** Whether the command carries its own handler (`false` for group-only parents). */
  hasHandler: boolean
  /** Static sub-commands, up to two levels deep (parent → children). */
  children?: DevframeInspectCommandInfo[]
}

/**
 * Serializable projection of a single running devframe instance discovered
 * in the machine-wide instance registry (`~/.devframe/instances/`), returned
 * by `devframes:plugin:inspect:list-instances`. A live, node-only view - the
 * inspector's Instances tab renders these as a read-only directory of the
 * other devframes running alongside this one.
 */
export interface DevframeInspectInstanceInfo {
  /** Definition id of the running instance. */
  id: string
  /** Definition display name, when the instance declares one. */
  name?: string
  /** Listening port. */
  port: number
  /** Dialable HTTP origin, e.g. `http://127.0.0.1:9876`. */
  origin: string
  /** Base path the devframe is mounted at (trailing slash). */
  basePath: string
  /** Full SPA URL (`origin` + `basePath`) - the link the tab opens. */
  url: string
  /** Process id of the instance's dev server. */
  pid: number
  /** Working directory the instance was started from. */
  rootDir: string
  /** Epoch-ms timestamp of registration (used to compute uptime). */
  startedAt: number
  /** Whether the instance exposes an MCP endpoint. */
  hasMcp: boolean
  /** Whether this is the inspector's own instance (matched by pid). */
  isCurrent: boolean
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
