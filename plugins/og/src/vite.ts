import type { DevframeViteOptions, DevframeVitePlugin } from '@devframes/vite/dev-spa'
import { devframeVite } from '@devframes/vite/dev-spa'
import ogDevframe from './index'

export type { DevframeViteOptions }

export type OgVitePluginOptions = DevframeViteOptions

/**
 * Mount the OG image preview into an existing Vite dev server. As a hosted
 * adapter it defers authentication to the host, so the bridged devframe's own
 * gate stays off by default — opt back in with `{ auth: true }`.
 */
export function ogVitePlugin(options: OgVitePluginOptions = {}): DevframeVitePlugin {
  return devframeVite(ogDevframe, options)
}
