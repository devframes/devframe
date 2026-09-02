import type { ContextRpcServer } from '../../node/rpc-core'
import type { WsOriginRegistry } from './ws-server'
import { createWsRpcPeerHooks, isAllowedOrigin } from './ws-server'

export interface AttachBunWsTransportOptions {
  /** Same contract as `WsRpcTransportOptions.allowedOrigins`. */
  allowedOrigins?: readonly string[] | WsOriginRegistry | false
}

/**
 * Structural view of the Bun `Bun.serve({ websocket })` handler object the
 * crossws Bun adapter produces, typed loosely so devframe carries no
 * dependency on Bun's own types.
 */
export interface BunWsTierWebSocket {
  open?: (ws: unknown) => unknown
  message: (ws: unknown, message: unknown) => unknown
  close?: (ws: unknown, code?: number, reason?: string) => unknown
  drain?: (ws: unknown) => unknown
}

export interface BunWsTier {
  /** Complete a WS upgrade request; `Bun.serve`'s server as 2nd argument. */
  handleUpgrade: (request: Request, server: unknown) => Promise<Response | undefined>
  /** The handlers to spread into `Bun.serve({ websocket })`. */
  websocket: BunWsTierWebSocket
  close: () => Promise<void>
}

/**
 * The Bun fetch-upgrade WebSocket tier for `initDevframe` / `initHub`: the
 * same RPC peer wiring as `attachWsRpcTransport`, driven by crossws's Bun
 * adapter so upgrades complete through `handler(request, server)` on the
 * app's own origin, with no side-car server. Load it dynamically so the Bun
 * adapter never enters a Node-only bundle path.
 */
export async function attachBunWsTransport(
  core: ContextRpcServer,
  options: AttachBunWsTransportOptions = {},
): Promise<BunWsTier> {
  const { default: bunAdapter } = await import('crossws/adapters/bun')
  const { allowedOrigins } = options

  const ws = bunAdapter({
    hooks: {
      ...createWsRpcPeerHooks(core.rpcGroup, {
        onConnected: core.onConnected,
        onDisconnected: core.onDisconnected,
      }),
      /**
       * The same origin policy `routeUpgrades` applies for the Node
       * transport, enforced at the upgrade hook since Bun upgrades arrive
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
    handleUpgrade: (request, server) =>
      ws.handleUpgrade(request, server as Parameters<typeof ws.handleUpgrade>[1]),
    websocket: ws.websocket as BunWsTierWebSocket,
    close: () => ws.close(),
  }
}
