import type { DevframeDefinition } from 'devframe/types'
import type { CodeServerOptions } from './types'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import pkg from '../package.json' with { type: 'json' }
import { DEFAULT_PORT, PLUGIN_ID } from './constants'

export {
  DEFAULT_CODE_SERVER_PORT,
  DEFAULT_PORT,
  getCookieSessionName,
  PLUGIN_ID,
  STATE_KEY,
} from './constants'
export type * from './types'

// The launcher SPA is built (by Vite) into `dist/spa`. From both the source
// entry (`src/index.ts`, via the workspace alias) and the published entry
// (`dist/index.mjs`), `../dist/spa` resolves to `<pkg>/dist/spa`.
const distDir = fileURLToPath(new URL('../dist/spa', import.meta.url))

/**
 * Build a {@link DevframeDefinition} for the code-server panel. The same
 * definition runs standalone (`createCac`), mounts into a Vite host
 * (`/vite`), or docks inside a hub — its `setup` only relies on the core
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
  const resolvedDist = options.distDir ?? distDir
  return defineDevframe({
    id: PLUGIN_ID,
    name: 'Code Server',
    version: pkg.version,
    packageName: pkg.name,
    homepage: pkg.homepage,
    description: pkg.description,
    icon: 'ph:code-duotone',
    // Leave undefined so `resolveBasePath` picks `/` standalone and
    // `/__<id>/` when hosted. Authors override via `options.basePath`.
    basePath: options.basePath,
    cli: {
      command: options.command ?? 'devframe-code-server',
      port: options.port ?? DEFAULT_PORT,
      portRange: options.portRange,
      random: options.random,
      distDir: existsSync(resolvedDist) ? resolvedDist : undefined,
      // Single-user localhost tool: auto-trust the connection so the launcher's
      // shared-state subscription and the auth handoff work without a manual
      // round-trip. Hosted adapters supply their own auth layer.
      auth: false,
    },
    spa: { loader: 'none' },
    async setup(ctx) {
      const { setupCodeServer } = await import('./node/index')
      await setupCodeServer(ctx, options)
    },
  })
}

/** Default-configured code-server devframe. */
const codeServer: DevframeDefinition = createCodeServerDevframe()
export default codeServer
