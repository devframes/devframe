import type { DevframeVitePlugin, ViteDevBridgeOptions } from '@devframes/vite'
import { viteDevBridge } from '@devframes/vite'
import assetsDevframe from './index'

export type { ViteDevBridgeOptions }

export type AssetsVitePluginOptions = ViteDevBridgeOptions

/**
 * Mount the assets manager into an existing Vite dev server. As a hosted
 * adapter it defers authentication to the host, so the bridged devframe's
 * own gate stays off by default — opt back in with `{ auth: true }`.
 */
export function assetsVitePlugin(options: AssetsVitePluginOptions = {}): DevframeVitePlugin {
  return viteDevBridge(assetsDevframe, options)
}
