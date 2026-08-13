import type { BirpcGroup, EventOptions } from 'birpc'
import type { DevframeRpcConnection } from 'devframe/rpc/transports/ws-server'
import type { DevframeNodeContext, DevframeNodeRpcSession, DevframeNodeRpcSessionMeta, DevframeRpcClientFunctions, DevframeRpcServerFunctions } from 'devframe/types'
import type { DevframeAuthHandler } from './auth'
import type { RpcFunctionsHostImpl } from './host-functions'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createRpcServer } from 'devframe/rpc/server'
import { diagnostics } from './diagnostics'

export interface CreateContextRpcServerOptions {
  context: DevframeNodeContext
  /**
   * Auth intent: `true`/omitted gates by default, `false` opts out (auto-trust
   * handshake shim), a {@link DevframeAuthHandler} installs a custom scheme.
   */
  auth?: boolean | DevframeAuthHandler
  /** Lower-level per-call gate by method name and session, without a full handler. */
  authorize?: (methodName: string, session: DevframeNodeRpcSession) => boolean
  /** Called once per new RPC connection, right after its session is created. */
  onPeerConnect?: (connection: DevframeRpcConnection, session: DevframeNodeRpcSession) => void
  /** Called once per closed RPC connection, after the transport's disconnect bookkeeping. */
  onPeerDisconnect?: (connection: DevframeRpcConnection, meta: DevframeNodeRpcSessionMeta) => void
  /** Forwarded verbatim to birpc's `rpcOptions` so a host keeps seeing RPC failures. */
  rpcOptions?: Pick<
    EventOptions<DevframeRpcClientFunctions, DevframeRpcServerFunctions, false>,
    'onFunctionError' | 'onGeneralError'
  >
}

export interface ContextRpcServer {
  rpcGroup: BirpcGroup<DevframeRpcClientFunctions, DevframeRpcServerFunctions, false>
  /** The resolved auth handler when `auth` was passed as one. */
  authHandler?: DevframeAuthHandler
  /**
   * Connection lifecycle handlers to wire into a transport binding
   * (`attachWsRpcTransport`'s `onConnected` / `onDisconnected`, or any other
   * crossws adapter's peer hooks via `createWsRpcPeerHooks`).
   */
  onConnected?: (connection: DevframeRpcConnection, meta: DevframeNodeRpcSessionMeta) => void
  onDisconnected: (connection: DevframeRpcConnection, meta: DevframeNodeRpcSessionMeta) => void
}

/**
 * Bind a devframe context's registered RPC functions to a birpc group,
 * transport-agnostically — the shared core under the instance shell's own
 * HTTP+WS binding (Node http + WS) and the Bun fetch-upgrade tier of
 * `createHandler`.
 *
 * Owns everything about serving RPC that is independent of *how* peers
 * connect: the auth handler's function registration, the
 * `AsyncLocalStorage`-based session resolver (so
 * `ctx.rpc.getCurrentRpcSession()` works inside handlers), the
 * `authorize` gate, and the `auth: false` auto-trust handshake shim.
 */
export function createContextRpcServer(options: CreateContextRpcServerOptions): ContextRpcServer {
  const { context } = options
  const rpcHost = context.rpc as unknown as RpcFunctionsHostImpl

  const asyncStorage = new AsyncLocalStorage<DevframeNodeRpcSession>()

  // A full auth handler (e.g. from `createInteractiveAuth`) registers its own
  // RPC functions and supplies both the resolver gate and the connect-time
  // trust hook. `authorize`/`onPeerConnect` are the lower-level escape
  // hatches for callers not using a full handler.
  const authHandler: DevframeAuthHandler | undefined = typeof options.auth === 'object' ? options.auth : undefined
  const effectiveAuthorize = options.authorize ?? authHandler?.authorize

  if (authHandler) {
    for (const fn of authHandler.rpcFunctions) {
      if (!rpcHost.definitions.has(fn.name))
        rpcHost.register(fn)
    }
  }

  const rpcGroup = createRpcServer<DevframeRpcClientFunctions, DevframeRpcServerFunctions>(
    rpcHost.functions,
    {
      rpcOptions: {
        // Forwarded as-is so a host with its own structured diagnostics
        // keeps seeing RPC failures.
        onFunctionError: options.rpcOptions?.onFunctionError,
        onGeneralError: options.rpcOptions?.onGeneralError,
        // Wrap each RPC handler in an AsyncLocalStorage context so
        // `ctx.rpc.getCurrentRpcSession()` works inside handlers (used
        // by streaming subscribe/unsubscribe/cancel and shared-state
        // sync), and — when an `authorize` gate is configured — reject
        // the call before it ever reaches the handler. Mirrors
        // `packages/core/src/node/ws.ts`'s resolver.
        resolver(name, fn) {
          // eslint-disable-next-line ts/no-this-alias
          const rpc = this
          if (!fn)
            return undefined
          return async function (this: any, ...args) {
            const meta = rpc.$meta as DevframeNodeRpcSessionMeta
            if (effectiveAuthorize && !effectiveAuthorize(name, { meta, rpc: rpc as any }))
              throw diagnostics.DF0036({ name })
            return await asyncStorage.run({
              rpc,
              meta,
            }, async () => {
              return (await fn).apply(this, args)
            })
          }
        },
      },
    },
  )

  ;(rpcHost as any)._rpcGroup = rpcGroup
  ;(rpcHost as any)._asyncStorage = asyncStorage
  ;(rpcHost as any)._authDisabled = options.auth === false

  // The browser client unconditionally calls `anonymous:devframe:auth` on
  // connect (see `client/rpc-ws.ts`). When `auth: false` is set on the
  // standalone server, register a noop handler that auto-trusts so the
  // client's hardcoded handshake succeeds. A host passing a full
  // `DevframeAuthHandler` already registered the real handler above, and
  // never opts into `auth: false`, so the two paths never overlap.
  if (options.auth === false && !rpcHost.definitions.has('anonymous:devframe:auth')) {
    rpcHost.register({
      name: 'anonymous:devframe:auth',
      type: 'action',
      handler: () => {
        const session = rpcHost.getCurrentRpcSession()
        if (session)
          session.meta.isTrusted = true
        return { isTrusted: true }
      },
    })
  }

  const onConnected = (authHandler || options.onPeerConnect)
    ? (connection: DevframeRpcConnection, meta: DevframeNodeRpcSessionMeta) => {
        const session: DevframeNodeRpcSession = {
          meta,
          rpc: rpcGroup.clients.find(client => (client as any).$meta === meta) as any,
        }
        authHandler?.onConnect(connection, session)
        options.onPeerConnect?.(connection, session)
      }
    : undefined

  const onDisconnected = (connection: DevframeRpcConnection, meta: DevframeNodeRpcSessionMeta): void => {
    options.onPeerDisconnect?.(connection, meta)
    rpcHost._emitSessionDisconnected(meta)
  }

  return {
    rpcGroup,
    authHandler,
    onConnected,
    onDisconnected,
  }
}
