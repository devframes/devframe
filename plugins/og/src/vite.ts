import type { DevframeVitePlugin, ViteDevBridgeOptions } from 'devframe/helpers/vite'
import { viteDevBridge } from 'devframe/helpers/vite'
import ogDevframe from './index'

export type { ViteDevBridgeOptions }

export type OgVitePluginOptions = ViteDevBridgeOptions

/**
 * Mount the OG image preview into an existing Vite dev server. As a hosted
 * adapter it defers authentication to the host, so the bridged devframe's own
 * gate stays off by default — opt back in with `{ auth: true }`.
 */
export function ogVitePlugin(options: OgVitePluginOptions = {}): DevframeVitePlugin {
  return viteDevBridge(ogDevframe, options)
}
