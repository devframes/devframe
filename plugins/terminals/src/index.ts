import type { DevframeDefinition, RemoteAssets } from 'devframe'
import type { TerminalsOptions } from './types'
import { defineDevframe } from 'devframe'
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
 * definition runs standalone (`createCac`), mounts into a Vite host
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
// The SPA ships in the lockstep `@devframes/plugin-terminals--assets` package,
// served on demand through devframe's remote-assets back-proxy. The definition's
// `importMetaUrl` (below) supplies the default `resolveFrom`, so a locally
// installed copy (a workspace link here) is served with zero network. The panel
// `clientScript` bundle (`dist/client`) stays in this node package.
const remoteAssets: RemoteAssets = {
  package: `${pkg.name}--assets`,
  version: pkg.version,
}

export function createTerminalsDevframe(options: TerminalsOptions = {}): DevframeDefinition {
  const distDir = options.distDir ?? remoteAssets

  return defineDevframe({
    id: PLUGIN_ID,
    name: 'Terminals',
    version: pkg.version,
    packageName: pkg.name,
    importMetaUrl: import.meta.url,
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
      // Gate the standalone server by default — shell access is sensitive.
      // `maybeOpenBrowser` folds the current OTP into the `--open` URL so
      // the tab lands already trusted.
      auth: options.auth ?? true,
    },
    dock: {
      category: '~builtin',
    },
    async setup(ctx) {
      const { setupTerminals } = await import('./node/index')
      await setupTerminals(ctx, options)
    },
  })
}

export default createTerminalsDevframe
