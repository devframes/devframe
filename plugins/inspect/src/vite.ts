import type { DevframeViteOptions, DevframeVitePlugin } from '@devframes/vite/dev-spa'
import { devframeVite } from '@devframes/vite/dev-spa'
import inspectDevframe from './index'

export type { DevframeViteOptions }

/**
 * Mount the inspector into an existing Vite dev server. In the default
 * static-mount mode it serves the built SPA at `/__devframes_plugin_inspect/`;
 * pass `{ bridge: true }` for the bridge mode where the host owns the SPA
 * and devframe runs a side-car RPC + WS server.
 */
export function inspectVitePlugin(options?: DevframeViteOptions): DevframeVitePlugin {
  return devframeVite(inspectDevframe, options)
}
