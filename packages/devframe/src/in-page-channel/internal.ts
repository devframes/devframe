import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { BirpcReturn } from 'birpc'
import type { RpcArgsSchema } from '../rpc/types'
import type { InPageChannelControlFrame } from './protocol'
import type { InPageFunctionDefinitionAny } from './types'
import { createBirpc } from 'birpc'
import { isControlFrame } from './protocol'

/**
 * Shared internals of the two endpoints: the coded error surface (browser
 * code, so plain coded `Error`s, since `nostics` diagnostics are node-side only),
 * the local function table with its receive pipeline, and the birpc wiring
 * of one `MessagePort`.
 */

export const DEFAULT_CALL_TIMEOUT_MS = 15_000
const DEFAULT_HEARTBEAT = { intervalMs: 5_000, timeoutMs: 12_000 }

/** Resolve the heartbeat option against its defaults. */
export function resolveHeartbeat(
  option: { intervalMs?: number, timeoutMs?: number } | false | undefined,
): { intervalMs: number, timeoutMs: number } | undefined {
  return option === false ? undefined : { ...DEFAULT_HEARTBEAT, ...option }
}

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

/** A coded in-page channel error; every failure mode carries a stable `code`. */
export class InPageChannelError extends Error {
  override name = 'InPageChannelError'
  constructor(
    public readonly code: InPageChannelErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
  }
}

const warned = new Set<string>()

/**
 * `console.warn` once per distinct message, since handshake noise (foreign
 * origins, version mismatches, missing targets) repeats on every retry tick.
 */
export function warnOnce(message: string): void {
  if (!warned.has(message)) {
    warned.add(message)
    console.warn(`[devframe] ${message}`)
  }
}

function jsonArrayViolation(value: unknown[], path: string, seen: Set<object>): string | undefined {
  for (let i = 0; i < value.length; i++) {
    const violation = jsonViolation(value[i], `${path}[${i}]`, seen)
    if (violation)
      return violation
  }
  return undefined
}

function jsonObjectViolation(value: object, path: string, seen: Set<object>): string | undefined {
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null)
    return `${path} is an instance of ${value.constructor?.name ?? 'an exotic class'}`
  for (const [key, entry] of Object.entries(value)) {
    const violation = jsonViolation(entry, `${path}.${key}`, seen)
    if (violation)
      return violation
  }
  return undefined
}

function jsonViolation(value: unknown, path: string, seen: Set<object>): string | undefined {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return undefined
  if (typeof value === 'number')
    return Number.isFinite(value) ? undefined : `${path} is ${value}`
  if (typeof value !== 'object')
    return `${path} is ${value === undefined ? '`undefined`' : `a ${typeof value}`}`
  if (seen.has(value))
    return `${path} is circular`
  seen.add(value)
  return Array.isArray(value)
    ? jsonArrayViolation(value, path, seen)
    : jsonObjectViolation(value, path, seen)
}

/**
 * Enforce a `jsonSerializable: true` contract: throws code
 * `not-serializable` naming the offending path when the value contains
 * anything strict JSON can't represent, surfacing the bug at the offending
 * call instead of a silent coercion later.
 */
function assertJsonSerializable(value: unknown, what: string, functionName: string): void {
  const violation = jsonViolation(value, what, new Set())
  if (violation) {
    throw new InPageChannelError(
      'not-serializable',
      `in-page function "${functionName}" is declared jsonSerializable, but ${violation}`,
    )
  }
}

function formatIssues(issues: readonly StandardSchemaV1.Issue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path?.map(s => (typeof s === 'object' ? s.key : s)).join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join('; ')
}

/**
 * Validate positional arguments against their Standard Schemas (mirrors the
 * RPC layer's `validateRpcArgs`): only indices with a schema are checked,
 * values pass through unchanged, the first failure rejects with code
 * `invalid-args`.
 */
async function validateArgs(name: string, schemas: RpcArgsSchema, args: readonly unknown[]): Promise<void> {
  for (let index = 0; index < schemas.length; index++) {
    const schema = schemas[index]
    if (!schema)
      continue
    const result = await schema['~standard'].validate(args[index])
    if (result.issues) {
      throw new InPageChannelError(
        'invalid-args',
        `in-page function "${name}" rejected argument ${index}: ${formatIssues(result.issues)}`,
      )
    }
  }
}

/** Serialization hooks applied per value at each endpoint. */
export interface InPageChannelSerialization {
  serialize?: (value: unknown) => unknown
  deserialize?: (value: unknown) => unknown
}

export function serializeArgs(codec: InPageChannelSerialization, args: unknown[]): unknown[] {
  return codec.serialize ? args.map(codec.serialize) : args
}
export function deserializeResult(codec: InPageChannelSerialization, result: unknown): unknown {
  return codec.deserialize && result !== undefined ? codec.deserialize(result) : result
}

/**
 * An endpoint's local function table, resolved by name when the remote side
 * calls in. Each handler is wrapped with the receive pipeline: deserialize
 * hook, `jsonSerializable` enforcement, Standard-Schema argument validation,
 * then serialize hook + `jsonSerializable` enforcement on the result.
 */
export function createLocalFunctionRegistry(codec: InPageChannelSerialization): {
  register: (definition: InPageFunctionDefinitionAny) => void
  on: (name: string, listener: (...args: unknown[]) => void) => () => void
  resolve: (name: string) => ((...args: unknown[]) => unknown) | undefined
} {
  const definitions = new Map<string, InPageFunctionDefinitionAny>()
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  return {
    register(definition) {
      definitions.set(definition.name, definition)
    },
    on(name, listener) {
      let registered = listeners.get(name)
      if (!registered) {
        registered = new Set()
        listeners.set(name, registered)
      }
      registered.add(listener)
      return () => {
        registered.delete(listener)
        if (registered.size === 0)
          listeners.delete(name)
      }
    },
    resolve(name) {
      const definition = definitions.get(name)
      const registered = listeners.get(name)
      if (!definition && !registered?.size)
        return undefined
      return async (...rawArgs: unknown[]) => {
        const args = codec.deserialize ? rawArgs.map(codec.deserialize) : rawArgs
        if (definition?.jsonSerializable)
          assertJsonSerializable(args, 'its arguments', definition.name)
        if (definition?.args?.length)
          await validateArgs(definition.name, definition.args, args)
        const result = await definition?.handler(...args)
        for (const listener of [...(listeners.get(name) ?? [])])
          listener(...args)
        if (definition?.jsonSerializable)
          assertJsonSerializable(result, 'its return value', definition.name)
        return codec.serialize && result !== undefined ? codec.serialize(result) : result
      }
    },
  }
}

type RemoteFunctions = Record<string, (...args: any[]) => any>

export interface AttachChannelPortOptions {
  /** Resolve a locally-registered handler by name (internal + user functions). */
  resolveLocal: (name: string) => ((...args: unknown[]) => unknown) | undefined
  /** A liveness control frame arrived (`bye` routes to `onPeerClosed`). */
  onControl: (kind: 'ping' | 'pong') => void
  /** The peer went away: graceful `bye`, or the port's `close` event fired. */
  onPeerClosed: () => void
}

/**
 * One live `MessagePort` wired into birpc, with the channel's control frames
 * (ping/pong/bye) filtered off the stream before birpc sees it. Both
 * endpoints attach every port through this seam, so a future transport only
 * has to produce something port-shaped.
 */
export interface AttachedChannelPort {
  rpc: BirpcReturn<RemoteFunctions, Record<string, never>, false>
  /** Epoch ms of the last frame received; liveness input for heartbeats. */
  lastActivity: number
  postControl: (kind: InPageChannelControlFrame['__dfIpc']) => void
  /** Detach: optionally send `bye`, reject pending calls, close the port. */
  dispose: (options?: { bye?: boolean, reason?: string }) => void
}

function wrapPostError(error: unknown): unknown {
  if (error instanceof DOMException && error.name === 'DataCloneError') {
    return new InPageChannelError(
      'not-cloneable',
      `a payload could not be structured-cloned across the in-page channel: ${error.message}. `
      + `Strip non-cloneable values (functions, DOM nodes, framework reactivity proxies) before sending: `
      + `declare the function \`jsonSerializable: true\` for a precise error, or provide a \`serialize\` hook.`,
      { cause: error },
    )
  }
  return error
}

export function attachChannelPort(port: MessagePort, options: AttachChannelPortOptions): AttachedChannelPort {
  let birpcHandler: ((data: unknown) => void) | undefined
  let disposed = false

  const rpc = createBirpc<RemoteFunctions, Record<string, never>, false>({}, {
    post: (data) => {
      try {
        port.postMessage(data)
      }
      catch (error) {
        throw wrapPostError(error)
      }
    },
    on: (fn) => {
      birpcHandler = fn as (data: unknown) => void
    },
    off: () => {
      birpcHandler = undefined
    },
    /**
     * Deadlines live at the endpoint layer (`withCallDeadline`) with
     * status-aware errors; birpc's own timer stays off.
     */
    timeout: -1,
    proxify: false,
    resolver: (name, resolved) => (resolved as ((...args: unknown[]) => unknown) | undefined) ?? options.resolveLocal(name),
  })

  const attached: AttachedChannelPort = {
    rpc,
    lastActivity: Date.now(),
    postControl(kind) {
      try {
        port.postMessage({ __dfIpc: kind } satisfies InPageChannelControlFrame)
      }
      catch {
        // A dead or detached port; the close/heartbeat paths handle it.
      }
    },
    dispose(disposeOptions) {
      if (disposed)
        return
      disposed = true
      if (disposeOptions?.bye)
        attached.postControl('bye')
      const reason = disposeOptions?.reason ?? 'the in-page channel port was closed'
      const error = new InPageChannelError('closed', `in-page channel call dropped: ${reason}`)
      attached.rpc.$rejectPendingCalls(({ reject }) => reject(error))
      attached.rpc.$close()
      port.removeEventListener('message', onMessage)
      port.removeEventListener('close', onClose)
      try {
        port.close()
      }
      catch {
        // Already closed.
      }
    },
  }

  function onMessage(event: MessageEvent): void {
    attached.lastActivity = Date.now()
    const data: unknown = event.data
    if (isControlFrame(data)) {
      if (data.__dfIpc === 'bye')
        options.onPeerClosed()
      else
        options.onControl(data.__dfIpc)
      return
    }
    birpcHandler?.(data)
  }
  function onClose(): void {
    options.onPeerClosed()
  }

  port.addEventListener('message', onMessage)
  // Instant peer-death detection where the port supports the `close` event
  // (modern browsers, Node); the heartbeat is the fallback elsewhere.
  port.addEventListener('close', onClose)
  port.start?.()

  return attached
}

/**
 * Race a call against its deadline, rejecting with a status-aware error
 * (code `timeout`). `ms <= 0` disables the deadline.
 */
export function withCallDeadline<T>(promise: Promise<T>, ms: number, describeTimeout: () => string): Promise<T> {
  if (ms <= 0)
    return promise
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new InPageChannelError('timeout', describeTimeout())), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
