import type { DevframeDefinition } from 'devframe/types'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import pkg from '../package.json' with { type: 'json' }
import { setupDataInspector } from './node/index'

/** Default devframe id — also the RPC namespace. */
const DEFAULT_ID = 'devframes:plugin:data-inspector'

/** Preferred standalone CLI port. */
const DEFAULT_PORT = 9014

// The Vue SPA is built (by Vite) into `dist/spa`. From both the source
// entry (`src/index.ts`, via the workspace alias) and the published
// entry (`dist/index.mjs`), `../dist/spa` resolves to `<pkg>/dist/spa`.
const distDir = fileURLToPath(new URL('../dist/spa', import.meta.url))

export interface DataInspectorDevframeOptions {
  /** Override the devframe id (and default mount path). */
  id?: string
  /** Override the display name shown in a host dock. */
  name?: string
  /** Override the dock icon. */
  icon?: string
  /**
   * Override the mount path. Left unset, the SPA mounts at `/` standalone
   * and `/__<id>/` when hosted (Vite/embedded).
   */
  basePath?: string
  /** Preferred standalone CLI port. */
  port?: number
  /**
   * Require the trust handshake on the standalone server. Defaults to
   * `false` (auto-trust) for the single-user localhost CLI. The in-process
   * agent (`@devframes/plugin-data-inspector/inject`) defaults to `true`.
   */
  auth?: boolean
  /**
   * Register the built-in example source — a small live playground graph
   * with suggested queries (default `true`). Disable once your own sources
   * cover the first-run experience.
   */
  exampleSource?: boolean
}

/**
 * Build a {@link DevframeDefinition} for the Data Inspector: an interactive
 * jora query workbench over data sources registered by other plugins, hosts,
 * files, or attached processes.
 *
 * The plugin is fully headless about sources — register them via
 * `@devframes/plugin-data-inspector/registry` (process-global, no context
 * needed) or through the `devframes:plugin:data-inspector:sources` context
 * service.
 *
 * @experimental This plugin is experimental and may change without a major
 * version bump until it stabilizes.
 */
export function createDataInspectorDevframe(options: DataInspectorDevframeOptions = {}): DevframeDefinition {
  const id = options.id ?? DEFAULT_ID
  return defineDevframe({
    id,
    name: options.name ?? 'Data Inspector',
    version: pkg.version,
    packageName: pkg.name,
    homepage: pkg.homepage,
    description: pkg.description,
    icon: options.icon ?? 'ph:crosshair-duotone',
    basePath: options.basePath,
    cli: {
      command: 'data-inspector',
      port: options.port ?? DEFAULT_PORT,
      distDir: existsSync(distDir) ? distDir : undefined,
      auth: options.auth ?? false,
    },
    spa: { loader: 'none' },
    dock: { category: '~builtin' },
    setup(ctx) {
      setupDataInspector(ctx, { exampleSource: options.exampleSource })
    },
  })
}

export default createDataInspectorDevframe()
export type { DataSourceEntry, DataSourcesService } from './registry/index'
export { DATA_SOURCES_SERVICE_ID, registerDataSource } from './registry/index'
