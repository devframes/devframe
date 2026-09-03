import type { DevframeDefinition, RemoteAssets } from 'devframe'
import type { CodeServerOptions } from './types'
import { defineDevframe } from 'devframe'
import pkg from '../../package.json' with { type: 'json' }
import { DEFAULT_PORT, PLUGIN_ID } from './constants'

export {
  DEFAULT_CODE_SERVER_PORT,
  DEFAULT_PORT,
  getCookieSessionName,
  PLUGIN_ID,
  STATE_KEY,
} from './constants'
export type * from './types'

// The SPA ships in the lockstep `@devframes/plugin-code-server--assets` package,
// served on demand through devframe's remote-assets back-proxy. The definition's
// `importMetaUrl` (below) supplies the default `resolveFrom`, so a locally
// installed copy (a workspace link here) is served with zero network.
const remoteAssets: RemoteAssets = {
  package: `${pkg.name}--assets`,
  version: pkg.version,
}

/**
 * Build a {@link DevframeDefinition} for the code-server panel. The same
 * definition runs standalone (`createCac`), mounts into a Vite host
 * (`/vite`), or docks inside a hub, since its `setup` only relies on the core
 * devframe RPC + shared-state surface.
 *
 * @experimental This plugin is experimental and may change without a major
 * version bump until it stabilizes.
 *
 * @example
 * ```ts
 * import { createCodeServerDevframe } from '@devframes/plugin-code-server'
 *
 * export default createCodeServerDevframe({ serverPort: 8080 })
 * ```
 */
export function createCodeServerDevframe(options: CodeServerOptions = {}): DevframeDefinition {
  const resolvedDist = options.distDir ?? remoteAssets
  return defineDevframe({
    id: PLUGIN_ID,
    name: 'Code Server',
    version: pkg.version,
    packageName: pkg.name,
    importMetaUrl: import.meta.url,
    homepage: pkg.homepage,
    description: pkg.description,
    icon: 'ph:code-duotone',
    /**
     * Leave undefined so `resolveBasePath` picks `/` standalone and
     * `/__<id>/` when hosted. Authors override via `options.basePath`.
     */
    basePath: options.basePath,
    cli: {
      command: options.command ?? 'devframe-code-server',
      port: options.port ?? DEFAULT_PORT,
      portRange: options.portRange,
      random: options.random,
      distDir: resolvedDist,
      /**
       * Gate the standalone launcher by default; `maybeOpenBrowser` folds the
       * current OTP into the `--open` URL so the tab lands already trusted.
       * Hosted adapters supply their own auth layer and ignore this.
       */
      auth: options.auth ?? true,
    },
    async setup(ctx) {
      const { setupCodeServer } = await import('./setup')
      await setupCodeServer(ctx, options)
    },
  })
}

export default createCodeServerDevframe
