import type { DevframeViteOptions, DevframeVitePlugin } from '@devframes/vite'
import { devframeVite } from '@devframes/vite'
import assetsDevframe from './index'

export type { DevframeViteOptions }

export type AssetsVitePluginOptions = DevframeViteOptions

/**
 * Mount the assets manager into an existing Vite dev server. As a hosted
 * adapter it defers authentication to the host, so the bridged devframe's
 * own gate stays off by default — opt back in with `{ auth: true }`.
 */
export function assetsVitePlugin(options: AssetsVitePluginOptions = {}): DevframeVitePlugin {
  return devframeVite(assetsDevframe, options)
}
