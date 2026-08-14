import type { DevframeViteBridgeOptions, DevframeVitePlugin } from '@devframes/vite'
import type { CodeServerOptions } from './types'
import { devframeViteBridge, devframeVitePlugin } from '@devframes/vite'
import { createCodeServerDevframe } from './index'

export interface CodeServerViteOptions extends CodeServerOptions {
  /** Forwarded to the underlying `devframeViteBridge`/`devframeVitePlugin` (mount base, etc.). */
  vite?: DevframeViteBridgeOptions
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
    devframeViteBridge(definition, vite),
    devframeVitePlugin(definition, { base: vite?.base }),
  ]
}
