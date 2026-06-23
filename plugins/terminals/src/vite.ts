import type { DevframeVitePlugin, ViteDevBridgeOptions } from 'devframe/helpers/vite'
import type { TerminalsOptions } from './types'
import { viteDevBridge } from 'devframe/helpers/vite'
import { createTerminalsDevframe } from './index'

export interface TerminalsViteOptions extends TerminalsOptions {
  /** Forwarded to the underlying `viteDevBridge` (mount base, etc.). */
  vite?: ViteDevBridgeOptions
}

/**
 * Mount the terminals panel into an existing Vite dev server. Returns two
 * plugins: a bridge that starts the devframe RPC + WebSocket server (so the
 * panel can stream terminal output), and a static mount that serves the
 * bundled SPA at the mount base. The bridge is listed first so its
 * `__connection.json` route is matched ahead of the SPA fallback.
 */
export function terminalsVite(options: TerminalsViteOptions = {}): DevframeVitePlugin[] {
  const { vite, ...terminalsOptions } = options
  const definition = createTerminalsDevframe(terminalsOptions)
  return [
    viteDevBridge(definition, { ...vite, devMiddleware: true }),
    viteDevBridge(definition, vite),
  ]
}
