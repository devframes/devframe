import type { DevframeVitePlugin, ViteDevBridgeOptions } from 'devframe/helpers/vite'
import type { CodeServerOptions } from './types'
import { viteDevBridge } from 'devframe/helpers/vite'
import { createCodeServerDevframe } from './index'

export interface CodeServerViteOptions extends CodeServerOptions {
  /** Forwarded to the underlying `viteDevBridge` (mount base, etc.). */
  vite?: ViteDevBridgeOptions
}

/**
 * Mount the code-server launcher into an existing Vite dev server. Returns two
 * plugins: a bridge that starts the devframe RPC + WebSocket server (so the
 * launcher can detect/start/stop code-server), and a static mount that serves
 * the bundled SPA at the mount base. The bridge is listed first so its
 * `__connection.json` route is matched ahead of the SPA fallback.
 */
export function codeServerVite(options: CodeServerViteOptions = {}): DevframeVitePlugin[] {
  const { vite, ...codeServerOptions } = options
  const definition = createCodeServerDevframe(codeServerOptions)
  return [
    viteDevBridge(definition, { ...vite, devMiddleware: true }),
    viteDevBridge(definition, vite),
  ]
}
