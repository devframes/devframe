import type { DevframeVitePlugin, ViteDevBridgeOptions } from 'devframe/helpers/vite'
import { viteDevBridge } from 'devframe/helpers/vite'
import a11yDevframe from './index.ts'

export type { ViteDevBridgeOptions }

/**
 * Mount the a11y inspector panel into an existing Vite dev server. In the
 * default static-mount mode it serves the built panel at
 * `/__devframe-a11y-inspector/`; pass `{ devMiddleware: true }` for the
 * bridge mode where the host owns the SPA and devframe runs a side-car
 * RPC + WS server.
 */
export function a11yVitePlugin(options?: ViteDevBridgeOptions): DevframeVitePlugin {
  return viteDevBridge(a11yDevframe, options)
}
