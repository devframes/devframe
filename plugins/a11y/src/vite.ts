import type { DevframeViteOptions, DevframeVitePlugin } from '@devframes/vite/dev-spa'
import { devframeVite } from '@devframes/vite/dev-spa'
import a11yDevframe from './index.ts'

export type { DevframeViteOptions }

/**
 * Mount the a11y inspector panel into an existing Vite dev server. In the
 * default static-mount mode it serves the built panel at
 * `/__devframes_plugin_a11y/`; pass `{ bridge: true }` for the bridge mode
 * where the host owns the SPA and devframe runs a side-car RPC + WS
 * server.
 *
 * The in-page agent that scans the host is loaded separately: a hub loads it
 * as this dock's client script (see {@link a11yAgentBundlePath}); a standalone
 * host adds `<script type="module">` for it (see the demo).
 */
export function a11yVitePlugin(options?: DevframeViteOptions): DevframeVitePlugin {
  return devframeVite(a11yDevframe, options)
}
