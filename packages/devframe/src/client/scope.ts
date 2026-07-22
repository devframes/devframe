import type { RpcFunctionDefinition } from 'devframe/rpc'
import type {
  DevframeRpcServerFunctions,
  DevframeSettings,
  RpcSharedStateGetOptions,
  ScopedRpcFn,
  ScopedServerFunctions,
  ScopedSharedStates,
} from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { StreamReader, StreamSink } from 'devframe/utils/streaming-channel'
import type { DevframeRpcClient, DevframeRpcContext } from './rpc'
import type { StreamingSubscribeOptions } from './rpc-streaming'
import { isQualifiedName, qualifyName } from 'devframe/utils/scope'
import { createClientSettings } from './settings'

// Callable guard so `Parameters` / `ReturnType` always have a function to
// work with even when a registry entry's type can't be proven callable.
type AnyRpcFn = (...args: any[]) => any

/**
 * Client-side streaming host scoped to a namespace. Channel names are
 * auto-prefixed with `<namespace>:`.
 */
export interface DevframeScopedClientStreamingHost {
  subscribe: <T = unknown>(channel: string, id: string, options?: StreamingSubscribeOptions) => StreamReader<T>
  upload: <T = unknown>(channel: string, id: string) => StreamSink<T>
}

/**
 * The scoped client RPC surface exposed on
 * `client.scope('my-plugin').rpc`. IDs and keys you pass are
 * auto-namespaced with `my-plugin:`.
 */
export interface DevframeScopedClientRpc<NS extends string = string> {
  /** The namespace this surface is scoped to. */
  readonly namespace: NS

  /**
   * Register a client (server→client) RPC function. The definition's
   * `name` must be bare (no `:`); it is stored as `<namespace>:<name>`.
   */
  register: (fn: RpcFunctionDefinition<string, any, any, any, any, any, DevframeRpcContext>) => void

  /** Call a server RPC function. Bare names resolve within this namespace. */
  call: {
    <T extends keyof ScopedServerFunctions<NS> & string>(method: T, ...args: Parameters<ScopedRpcFn<DevframeRpcServerFunctions, NS, T>>): Promise<Awaited<ReturnType<ScopedRpcFn<DevframeRpcServerFunctions, NS, T>>>>
    <T extends keyof DevframeRpcServerFunctions & string>(method: T, ...args: Parameters<Extract<DevframeRpcServerFunctions[T], AnyRpcFn>>): Promise<Awaited<ReturnType<Extract<DevframeRpcServerFunctions[T], AnyRpcFn>>>>
    (method: string, ...args: any[]): Promise<any>
  }

  /** Call a server RPC event (fire-and-forget). */
  callEvent: {
    <T extends keyof ScopedServerFunctions<NS> & string>(method: T, ...args: Parameters<ScopedRpcFn<DevframeRpcServerFunctions, NS, T>>): void
    <T extends keyof DevframeRpcServerFunctions & string>(method: T, ...args: Parameters<Extract<DevframeRpcServerFunctions[T], AnyRpcFn>>): void
    (method: string, ...args: any[]): void
  }

  /** Call an optional server RPC function (no error if unregistered). */
  callOptional: {
    <T extends keyof ScopedServerFunctions<NS> & string>(method: T, ...args: Parameters<ScopedRpcFn<DevframeRpcServerFunctions, NS, T>>): Promise<Awaited<ReturnType<ScopedRpcFn<DevframeRpcServerFunctions, NS, T>>> | undefined>
    <T extends keyof DevframeRpcServerFunctions & string>(method: T, ...args: Parameters<Extract<DevframeRpcServerFunctions[T], AnyRpcFn>>): Promise<Awaited<ReturnType<Extract<DevframeRpcServerFunctions[T], AnyRpcFn>>> | undefined>
    (method: string, ...args: any[]): Promise<any>
  }

  /** Resolve a namespaced shared state. Bare keys resolve within this namespace. */
  sharedState: {
    <T extends keyof ScopedSharedStates<NS> & string>(key: T, options?: RpcSharedStateGetOptions<ScopedSharedStates<NS>[T]>): Promise<SharedState<ScopedSharedStates<NS>[T]>>
    <T extends Record<string, any> = Record<string, any>>(key: string, options?: RpcSharedStateGetOptions<T>): Promise<SharedState<T>>
  }

  /** Streaming host scoped to this namespace. */
  streaming: DevframeScopedClientStreamingHost
}

/**
 * A namespace-scoped view of the {@link DevframeRpcClient}. Returned by
 * `client.scope('my-plugin')`. Replaces `rpc` with the auto-namespaced
 * surface and adds a top-level `settings` store.
 */
export interface DevframeScopedClientContext<NS extends string = string, Settings extends Record<string, any> = Record<string, any>> {
  /** The namespace this context is scoped to. */
  readonly namespace: NS
  /** The underlying unscoped client. */
  readonly base: DevframeRpcClient
  rpc: DevframeScopedClientRpc<NS>
  /** Persisted settings for this namespace (`global` + `project`). */
  settings: DevframeSettings<Settings>
  /**
   * Return a new scoped client, replacing the current scope. Pass `null`
   * or `''` to un-scope and get the base client.
   */
  scope: DevframeRpcClient['scope']
}

/**
 * Build a namespace-scoped view of a {@link DevframeRpcClient}. Every RPC
 * id, shared-state key, and streaming channel passed through the returned
 * `rpc` surface is auto-namespaced with `<namespace>:`.
 */
export function createScopedClientContext<NS extends string = string>(
  rpc: DevframeRpcClient,
  namespace: NS,
): DevframeScopedClientContext<NS> {
  const scopedRpc: DevframeScopedClientRpc<NS> = {
    namespace,
    register(fn) {
      if (isQualifiedName(fn.name)) {
        throw new Error(
          `[devframe] Scoped client RPC registration for namespace "${namespace}" received an already-namespaced function name "${fn.name}". `
          + `Pass a bare name without a ":" separator.`,
        )
      }
      rpc.client.register({ ...fn, name: `${namespace}:${fn.name}` })
    },
    call: ((method: string, ...args: any[]) =>
      (rpc.call as any)(qualifyName(namespace, method), ...args)) as DevframeScopedClientRpc<NS>['call'],
    callEvent: ((method: string, ...args: any[]) =>
      (rpc.callEvent as any)(qualifyName(namespace, method), ...args)) as DevframeScopedClientRpc<NS>['callEvent'],
    callOptional: ((method: string, ...args: any[]) =>
      (rpc.callOptional as any)(qualifyName(namespace, method), ...args)) as DevframeScopedClientRpc<NS>['callOptional'],
    sharedState: ((key: string, options?: any) =>
      (rpc.sharedState.get as any)(qualifyName(namespace, key), options)) as DevframeScopedClientRpc<NS>['sharedState'],
    streaming: {
      subscribe: (channel, id, options) => rpc.streaming.subscribe(qualifyName(namespace, channel), id, options),
      upload: (channel, id) => rpc.streaming.upload(qualifyName(namespace, channel), id),
    },
  }

  return {
    namespace,
    base: rpc,
    rpc: scopedRpc,
    settings: createClientSettings(rpc, namespace),
    scope: rpc.scope,
  }
}
