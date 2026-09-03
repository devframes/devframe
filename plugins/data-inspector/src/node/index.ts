import type { DevframeDefinition, RemoteAssets } from 'devframe'
import { defineDevframe } from 'devframe'
import pkg from '../../package.json' with { type: 'json' }
import { setupDataInspector } from './setup'

/** Default devframe id, also the RPC namespace. */
const DEFAULT_ID = 'devframes:plugin:data-inspector'

/** Preferred standalone CLI port. */
const DEFAULT_PORT = 9014

// The SPA ships in the lockstep `@devframes/plugin-data-inspector--assets` package,
// served on demand through devframe's remote-assets back-proxy. The definition's
// `importMetaUrl` (below) supplies the default `resolveFrom`, so a locally
// installed copy (a workspace link here) is served with zero network.
const remoteAssets: RemoteAssets = {
  package: `${pkg.name}--assets`,
  version: pkg.version,
}

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
   * Require the trust handshake on the standalone server. Enabled by
   * default; `--open` embeds the current OTP in the opened URL, so the
   * tab authenticates automatically without extra prompts. The in-process
   * inject endpoint (`@devframes/plugin-data-inspector/inject`) uses its own
   * pre-shared-token scheme and is unaffected by this option.
   */
  auth?: boolean
  /**
   * Register the built-in example source, a small live playground graph
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
 * The plugin is fully headless about sources; register them via
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
    importMetaUrl: import.meta.url,
    homepage: pkg.homepage,
    description: pkg.description,
    icon: options.icon ?? 'ph:crosshair-duotone',
    basePath: options.basePath,
    cli: {
      command: 'data-inspector',
      port: options.port ?? DEFAULT_PORT,
      distDir: remoteAssets,
      auth: options.auth ?? true,
    },
    dock: { category: '~builtin' },
    setup(ctx) {
      setupDataInspector(ctx, { exampleSource: options.exampleSource })
    },
  })
}

export default createDataInspectorDevframe
export type { DataSourceEntry, DataSourceHandle, DataSourcesService } from './registry/index'
export { DATA_SOURCES_SERVICE_ID, registerDataSource } from './registry/index'
