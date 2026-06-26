import type { DevframeDefinition } from 'devframe/types'
import type { TerminalsOptions } from './types'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import pkg from '../package.json' with { type: 'json' }
import {
  DEFAULT_PORT,
  PLUGIN_ID,
  PRESETS_STATE_KEY,
  SESSIONS_STATE_KEY,
  TERMINAL_STREAM_CHANNEL,
} from './constants'

export type * from './types'
export {
  DEFAULT_PORT,
  PLUGIN_ID,
  PRESETS_STATE_KEY,
  SESSIONS_STATE_KEY,
  TERMINAL_STREAM_CHANNEL,
}

/**
 * Build a {@link DevframeDefinition} for the terminals panel. The same
 * definition runs standalone (`createCli`), mounts into a Vite host
 * (`/vite`), or docks inside a hub — its `setup` only relies on the core
 * devframe RPC surface.
 *
 * @experimental This plugin is experimental and may change without a major
 * version bump until it stabilizes.
 *
 * @example
 * ```ts
 * import { createTerminalsDevframe } from '@devframes/plugin-terminals'
 *
 * export default createTerminalsDevframe({
 *   presets: [{ id: 'dev', title: 'pnpm dev', command: 'pnpm', args: ['dev'] }],
 * })
 * ```
 */
export function createTerminalsDevframe(options: TerminalsOptions = {}): DevframeDefinition {
  const distDir = options.distDir ?? fileURLToPath(new URL('../dist/spa', import.meta.url))

  return defineDevframe({
    id: PLUGIN_ID,
    name: 'Terminals',
    version: pkg.version,
    packageName: pkg.name,
    homepage: pkg.homepage,
    description: pkg.description,
    icon: 'ph:terminal-window-duotone',
    // Leave undefined so `resolveBasePath` picks `/` standalone and
    // `/__<id>/` when hosted. Authors override via `options.basePath`.
    basePath: options.basePath,
    cli: {
      command: options.command ?? 'devframe-terminals',
      port: options.port ?? DEFAULT_PORT,
      distDir,
      // Single-user localhost tool: auto-trust the connection so streaming
      // and shared-state sync work without an auth round-trip.
      auth: false,
    },
    spa: { loader: 'none' },
    async setup(ctx) {
      const { setupTerminals } = await import('./node/index')
      await setupTerminals(ctx, options)
    },
  })
}

/** Default-configured terminals devframe (interactive shell, no presets). */
const terminals: DevframeDefinition = createTerminalsDevframe()
export default terminals
