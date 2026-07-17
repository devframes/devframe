import type { DevframeVitePlugin, ViteDevBridgeOptions } from 'devframe/helpers/vite'
import { viteDevBridge } from 'devframe/helpers/vite'
import inspectDevframe from './index'

export type { ViteDevBridgeOptions }

/**
 * Mount the inspector into an existing Vite dev server. In the default
 * static-mount mode it serves the built SPA at `/__devframes_plugin_inspect/`;
 * pass `{ devMiddleware: true }` for the bridge mode where the host owns
 * the SPA and devframe runs a side-car RPC + WS server.
 */
export function inspectVitePlugin(options?: ViteDevBridgeOptions): DevframeVitePlugin {
  return viteDevBridge(inspectDevframe, options)
}
