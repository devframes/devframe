import type { DevframeViteOptions, DevframeVitePlugin } from '@devframes/vite'
import { devframeVite } from '@devframes/vite'
import messagesDevframe from './index'

export type { DevframeViteOptions }

/**
 * Mount the messages panel into an existing Vite dev server. In the default
 * static-mount mode it serves the built SPA at `/__devframes_plugin_messages/`;
 * pass `{ bridge: true }` for the bridge mode where the host owns the SPA
 * and devframe runs a side-car RPC + WS server.
 */
export function messagesVitePlugin(options?: DevframeViteOptions): DevframeVitePlugin {
  return devframeVite(messagesDevframe, options)
}
