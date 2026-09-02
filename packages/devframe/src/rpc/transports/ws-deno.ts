import type { ContextRpcServer } from '../../node/rpc-core'
import type { WsOriginRegistry } from './ws-server'
import { createWsRpcPeerHooks, isAllowedOrigin } from './ws-server'

export interface AttachDenoWsTransportOptions {
  /** Same contract as `WsRpcTransportOptions.allowedOrigins`. */
  allowedOrigins?: readonly string[] | WsOriginRegistry | false
}

export interface DenoWsTier {
  /**
   * Complete a WS upgrade request; `Deno.serve`'s handler info as the 2nd
   * argument. Unlike Bun, Deno's adapter attaches the socket to the returned
   * `Response` itself, so there is no `websocket` handler object to register.
   */
  handleUpgrade: (request: Request, info: unknown) => Promise<Response>
  close: () => Promise<void>
}

/**
 * The Deno fetch-upgrade WebSocket tier for `initDevframe` / `initHub`: the
 * same RPC peer wiring as `attachWsRpcTransport`, driven by crossws's Deno
 * adapter so upgrades complete through `handleUpgrade(request, info)` on the
 * app's own origin, with no side-car server. Load it dynamically so the Deno
 * adapter never enters a Node-only bundle path.
 */
export async function attachDenoWsTransport(
  core: ContextRpcServer,
  options: AttachDenoWsTransportOptions = {},
): Promise<DenoWsTier> {
  const { default: denoAdapter } = await import('crossws/adapters/deno')
  const { allowedOrigins } = options

  const ws = denoAdapter({
    hooks: {
      ...createWsRpcPeerHooks(core.rpcGroup, {
        onConnected: core.onConnected,
        onDisconnected: core.onDisconnected,
      }),
      /**
       * The same origin policy `routeUpgrades` applies for the Node
       * transport, enforced at the upgrade hook since Deno upgrades arrive
       * as fetch requests rather than `upgrade` socket events.
       */
      upgrade(request) {
        const origin = request.headers.get('origin') ?? undefined
        const allowed = allowedOrigins && !Array.isArray(allowedOrigins)
          ? (allowedOrigins as WsOriginRegistry).isAllowed(origin)
          : isAllowedOrigin(origin, (allowedOrigins as readonly string[] | false | undefined) || [])
        if (allowedOrigins !== false && !allowed)
          return new Response('Forbidden', { status: 403 })
      },
    },
  })

  return {
    handleUpgrade: (request, info) =>
      ws.handleUpgrade(request, info as Parameters<typeof ws.handleUpgrade>[1]),
    close: () => ws.close(),
  }
}
