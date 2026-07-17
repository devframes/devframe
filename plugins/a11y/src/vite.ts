import type { DevframeVitePlugin, ViteDevBridgeOptions } from 'devframe/helpers/vite'
import { viteDevBridge } from 'devframe/helpers/vite'
import a11yDevframe from './index.ts'

export type { ViteDevBridgeOptions }

/**
 * Mount the a11y inspector panel into an existing Vite dev server. In the
 * default static-mount mode it serves the built panel at
 * `/__devframes_plugin_a11y/`; pass `{ devMiddleware: true }` for the
 * bridge mode where the host owns the SPA and devframe runs a side-car
 * RPC + WS server.
 *
 * The in-page agent that scans the host is loaded separately: a hub loads it
 * as this dock's client script (see {@link a11yAgentBundlePath}); a standalone
 * host adds `<script type="module">` for it (see the demo).
 */
export function a11yVitePlugin(options?: ViteDevBridgeOptions): DevframeVitePlugin {
  return viteDevBridge(a11yDevframe, options)
}
