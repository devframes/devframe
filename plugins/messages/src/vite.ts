import type { DevframeVitePlugin, ViteDevBridgeOptions } from 'devframe/helpers/vite'
import { viteDevBridge } from 'devframe/helpers/vite'
import messagesDevframe from './index'

export type { ViteDevBridgeOptions }

/**
 * Mount the messages panel into an existing Vite dev server. In the default
 * static-mount mode it serves the built SPA at `/__devframes-plugin-messages/`;
 * pass `{ devMiddleware: true }` for the bridge mode where the host owns
 * the SPA and devframe runs a side-car RPC + WS server.
 */
export function messagesVitePlugin(options?: ViteDevBridgeOptions): DevframeVitePlugin {
  return viteDevBridge(messagesDevframe, options)
}
