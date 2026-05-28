import type { BirpcGroup } from 'birpc'
import type { DevframeNodeContext, DevframeNodeRpcSession, DevframeNodeRpcSessionMeta, DevframeRpcClientFunctions, DevframeRpcServerFunctions, RpcBroadcastOptions, RpcFunctionsHost as RpcFunctionsHostType, RpcSharedStateHost, RpcStreamingHost } from 'devframe/types'
import type { AsyncLocalStorage } from 'node:async_hooks'
import { RpcFunctionsCollectorBase } from 'devframe/rpc'
import { createDebug } from 'obug'
import { diagnostics } from './diagnostics'
import { createRpcSharedStateServerHost } from './rpc-shared-state'
import { createRpcStreamingServerHost } from './rpc-streaming'

const debugBroadcast = createDebug('devframe:rpc:broadcast')

export class RpcFunctionsHost extends RpcFunctionsCollectorBase<DevframeRpcServerFunctions, DevframeNodeContext> implements RpcFunctionsHostType {
  /**
   * @internal
   */
  _rpcGroup: BirpcGroup<DevframeRpcClientFunctions, DevframeRpcServerFunctions, false> = undefined!
  _asyncStorage: AsyncLocalStorage<DevframeNodeRpcSession> = undefined!

  constructor(context: DevframeNodeContext) {
    super(context)

    this.sharedState = createRpcSharedStateServerHost(this)
    this.streaming = createRpcStreamingServerHost(this)
  }

  sharedState: RpcSharedStateHost
  streaming: RpcStreamingHost

  /**
   * Adapters call this from their WS `onDisconnected` hook so downstream
   * hosts (streaming, …) can free per-session state. Public-ish because
   * tests / custom adapters may want to mirror it.
   *
   * @internal
   */
  _emitSessionDisconnected(meta: DevframeNodeRpcSessionMeta): void {
    this.streaming._onSessionDisconnected(meta)
  }

  async invokeLocal<
    T extends keyof DevframeRpcServerFunctions,
    Args extends Parameters<DevframeRpcServerFunctions[T]>,
  >(
    method: T,
    ...args: Args
  ): Promise<Awaited<ReturnType<DevframeRpcServerFunctions[T]>>> {
    if (!this.definitions.has(method as string)) {
      throw diagnostics.DF0006({ name: String(method) })
    }

    const handler = await this.getHandler(method)
    return await Promise.resolve(
      (handler as (...args: Args) => ReturnType<DevframeRpcServerFunctions[T]>)(...args),
    ) as Awaited<ReturnType<DevframeRpcServerFunctions[T]>>
  }

  async broadcast<
    T extends keyof DevframeRpcClientFunctions,
    Args extends Parameters<DevframeRpcClientFunctions[T]>,
  >(
    options: RpcBroadcastOptions<T, Args>,
  ): Promise<void> {
    if (!this._rpcGroup)
      return

    debugBroadcast(JSON.stringify(options.method))

    await Promise.allSettled(
      this._rpcGroup.clients.map((client) => {
        if (options.filter?.(client) === false)
          return undefined
        return client.$callRaw({
          optional: true,
          event: true,
          ...options,
        })
      }),
    )
  }

  getCurrentRpcSession(): DevframeNodeRpcSession | undefined {
    if (!this._asyncStorage)
      throw diagnostics.DF0007()
    return this._asyncStorage.getStore()
  }
}
