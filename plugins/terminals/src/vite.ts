import type { DevframeViteBridgeOptions, DevframeVitePlugin } from '@devframes/vite'
import type { TerminalsOptions } from './types'
import { devframeViteBridge, devframeVitePlugin } from '@devframes/vite'
import { createTerminalsDevframe } from './index'

export interface TerminalsViteOptions extends TerminalsOptions {
  /** Forwarded to the underlying `devframeViteBridge`/`devframeVitePlugin` (mount base, etc.). */
  vite?: DevframeViteBridgeOptions
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
    devframeViteBridge(definition, vite),
    devframeVitePlugin(definition, { base: vite?.base }),
  ]
}
