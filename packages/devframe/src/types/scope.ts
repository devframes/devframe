import type { RpcFunctionDefinition } from 'devframe/rpc'
import type { SharedState } from 'devframe/utils/shared-state'
import type { DevframeAgentHost } from './agent'
import type { DevframeNodeContext } from './context'
import type { DevframeDiagnosticsHost } from './diagnostics'
import type { DevframeHost } from './host'
import type {
  DevframeNodeRpcSession,
  RpcSharedStateGetOptions,
  RpcStreamingChannel,
  RpcStreamingChannelOptions,
} from './rpc'
import type { DevframeRpcClientFunctions, DevframeRpcServerFunctions, DevframeRpcSharedStates } from './rpc-augments'
import type { DevframeViewHost } from './views'

// Callable guard so `Parameters` / `ReturnType` always have a function to
// work with even when a registry entry's type can't be proven callable.
type AnyRpcFn = (...args: any[]) => any

/**
 * Augmentable registry mapping a scope namespace to the shape of its
 * persisted settings. Tools augment it so `ctx.scope('my-plugin')`
 * gets a fully-typed `settings.global` / `settings.project`:
 *
 * ```ts
 * declare module 'devframe' {
 *   interface DevframeSettingsRegistry {
 *     'my-plugin': { theme: 'light' | 'dark', recentFiles: string[] }
 *   }
 * }
 * ```
 */
export interface DevframeSettingsRegistry {}

/**
 * Resolve the settings shape for a namespace from
 * {@link DevframeSettingsRegistry}, falling back to an open record when
 * the namespace hasn't been augmented.
 */
export type SettingsForNamespace<NS extends string>
  = NS extends keyof DevframeSettingsRegistry
    ? DevframeSettingsRegistry[NS] extends Record<string, any>
      ? DevframeSettingsRegistry[NS]
      : Record<string, any>
    : Record<string, any>

/**
 * A persisted key-value settings store for one scope (`global` or
 * `project`). Backed by a file on the node side and by the shared-state
 * sync protocol on the client, so a `set` on either side propagates to
 * every connected peer and survives restarts.
 *
 * Every method is async because the underlying shared state is resolved
 * lazily on first access.
 */
export interface DevframeSettingsStore<T extends Record<string, any> = Record<string, any>> {
  /** Read a single setting. Resolves to `undefined` when unset. */
  get: <K extends keyof T>(key: K) => Promise<T[K] | undefined>
  /** Write a single setting. */
  set: <K extends keyof T>(key: K, value: T[K]) => Promise<void>
  /** Remove a single setting. */
  delete: <K extends keyof T>(key: K) => Promise<void>
  /** Read the whole settings object (immutable snapshot). */
  all: () => Promise<Readonly<T>>
  /**
   * Subscribe to settings changes. Resolves to an unsubscribe function.
   * Fires on every local or remote mutation with the full snapshot.
   */
  onChange: (fn: (value: Readonly<T>) => void) => Promise<() => void>
}

/**
 * The two settings scopes available on a scoped context.
 *
 *   - `project` — per-workspace state, persisted under the host's
 *     `workspace` storage dir. Project-local settings.
 *   - `global`  — per-user state, persisted under the host's `global`
 *     storage dir. Machine-wide preferences.
 */
export interface DevframeSettings<T extends Record<string, any> = Record<string, any>> {
  global: DevframeSettingsStore<T>
  project: DevframeSettingsStore<T>
}

/**
 * Map the server-side RPC registry down to the bare names owned by a
 * namespace, so a scoped `call('get-cwd')` is typed without the
 * `my-plugin:` prefix.
 */
export type ScopedServerFunctions<NS extends string> = {
  [K in keyof DevframeRpcServerFunctions as K extends `${NS}:${infer R}` ? R : never]: DevframeRpcServerFunctions[K]
}

/**
 * Map the client-side RPC registry down to the bare names owned by a
 * namespace, used by scoped `broadcast`.
 */
export type ScopedClientFunctions<NS extends string> = {
  [K in keyof DevframeRpcClientFunctions as K extends `${NS}:${infer R}` ? R : never]: DevframeRpcClientFunctions[K]
}

/**
 * Map the shared-state registry down to the bare keys owned by a
 * namespace, so scoped `sharedState('messages')` is typed without the
 * `my-plugin:` prefix.
 */
export type ScopedSharedStates<NS extends string> = {
  [K in keyof DevframeRpcSharedStates as K extends `${NS}:${infer R}` ? R : never]: DevframeRpcSharedStates[K]
}

/**
 * Broadcast options for a scoped client method (bare name).
 */
export interface ScopedBroadcastOptions<METHOD, Args extends any[]> {
  method: METHOD
  args: Args
  optional?: boolean
  event?: boolean
}

/**
 * Node-side streaming host scoped to a namespace. Channel names are
 * auto-prefixed with `<namespace>:`.
 */
export interface DevframeScopedStreamingHost {
  /**
   * Register a streaming channel. The bare `name` is auto-prefixed with
   * the scope namespace (`<namespace>:<name>`); pass an already-qualified
   * name (containing `:`) to opt out.
   */
  create: <T = unknown>(name: string, opts?: RpcStreamingChannelOptions) => RpcStreamingChannel<T>
}

/**
 * The scoped node RPC surface exposed on `ctx.scope('my-plugin').rpc`.
 * IDs and keys you pass are auto-namespaced with `my-plugin:`.
 */
export interface DevframeScopedNodeRpc<NS extends string = string> {
  /** The namespace this surface is scoped to. */
  readonly namespace: NS

  /**
   * Register a server RPC function. The definition's `name` must be bare
   * (no `:`); it is stored as `<namespace>:<name>`. Throws `DF0034` if an
   * already-namespaced name is passed.
   */
  register: (fn: RpcFunctionDefinition<string, any, any, any, any, any, DevframeNodeContext>, force?: boolean) => void
  /**
   * Update a previously registered server RPC function. Same naming rules
   * as {@link DevframeScopedNodeRpc.register}.
   */
  update: (fn: RpcFunctionDefinition<string, any, any, any, any, any, DevframeNodeContext>, force?: boolean) => void

  /**
   * Invoke a locally registered server RPC function. Bare names are
   * resolved within this namespace; pass a fully-qualified name
   * (containing `:`) to call another scope's function.
   */
  call: {
    <T extends keyof ScopedServerFunctions<NS> & string>(method: T, ...args: Parameters<Extract<ScopedServerFunctions<NS>[T], AnyRpcFn>>): Promise<Awaited<ReturnType<Extract<ScopedServerFunctions<NS>[T], AnyRpcFn>>>>
    <T extends keyof DevframeRpcServerFunctions & string>(method: T, ...args: Parameters<Extract<DevframeRpcServerFunctions[T], AnyRpcFn>>): Promise<Awaited<ReturnType<Extract<DevframeRpcServerFunctions[T], AnyRpcFn>>>>
    (method: string, ...args: any[]): Promise<any>
  }

  /**
   * Broadcast a client RPC event to every connected client. Bare method
   * names are resolved within this namespace.
   */
  broadcast: {
    <T extends keyof ScopedClientFunctions<NS> & string>(options: ScopedBroadcastOptions<T, Parameters<Extract<ScopedClientFunctions<NS>[T], AnyRpcFn>>>): Promise<void>
    (options: ScopedBroadcastOptions<string, any[]>): Promise<void>
  }

  /**
   * Resolve a namespaced shared state. Bare keys are resolved within this
   * namespace; pass a fully-qualified key (containing `:`) to opt out.
   */
  sharedState: {
    <T extends keyof ScopedSharedStates<NS> & string>(key: T, options?: RpcSharedStateGetOptions<ScopedSharedStates<NS>[T]>): Promise<SharedState<ScopedSharedStates<NS>[T]>>
    <T extends Record<string, any> = Record<string, any>>(key: string, options?: RpcSharedStateGetOptions<T>): Promise<SharedState<T>>
  }

  /** Streaming host scoped to this namespace. */
  streaming: DevframeScopedStreamingHost

  /** Pass-through to the current RPC session, when called inside a handler. */
  getCurrentRpcSession: () => DevframeNodeRpcSession | undefined
}

/**
 * A namespace-scoped view of {@link DevframeNodeContext}. Returned by
 * `ctx.scope('my-plugin')`. Re-exposes the unscoped surfaces (`views`,
 * `diagnostics`, `agent`, …), replaces `rpc` with the auto-namespaced
 * {@link DevframeScopedNodeRpc}, and adds a top-level `settings` store.
 */
export interface DevframeScopedNodeContext<NS extends string = string, Settings extends Record<string, any> = Record<string, any>> {
  /** The namespace this context is scoped to. */
  readonly namespace: NS
  /** The underlying unscoped context. */
  readonly base: DevframeNodeContext
  readonly workspaceRoot: string
  readonly cwd: string
  readonly mode: 'dev' | 'build'
  host: DevframeHost
  rpc: DevframeScopedNodeRpc<NS>
  /** Persisted settings for this namespace (`global` + `project`). */
  settings: DevframeSettings<Settings>
  views: DevframeViewHost
  diagnostics: DevframeDiagnosticsHost
  agent: DevframeAgentHost
  /** Derive another scope, or pass `null` / `''` to get the base context. */
  scope: DevframeNodeContext['scope']
}
