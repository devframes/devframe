import type { DevframeVitePlugin, ViteDevBridgeOptions } from 'devframe/helpers/vite'
import { viteDevBridge } from 'devframe/helpers/vite'
import dataInspectorDevframe from './index'

export type { ViteDevBridgeOptions }

/**
 * Mount the data inspector into an existing Vite dev server. In the default
 * static-mount mode it serves the built SPA at `/__devframes:plugin:data-inspector/`;
 * pass `{ devMiddleware: true }` for the bridge mode where the host owns
 * the SPA and devframe runs a side-car RPC + WS server.
 *
 * Register the host's own objects as sources next to it:
 *
 * ```ts
 * import { registerDataSource } from '@devframes/plugin-data-inspector/registry'
 *
 * configureServer(server) {
 *   registerDataSource({ id: 'vite:server', title: 'Vite Dev Server', data: () => server })
 * }
 * ```
 */
export function dataInspectorVitePlugin(options?: ViteDevBridgeOptions): DevframeVitePlugin {
  return viteDevBridge(dataInspectorDevframe, options)
}
