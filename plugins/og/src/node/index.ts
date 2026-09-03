import type { DevframeDefinition, RemoteAssets } from 'devframe'
import type { OgFetch } from './types'
import { defineDevframe } from 'devframe'
import pkg from '../../package.json' with { type: 'json' }
import { setupOg } from './setup'

const DEFAULT_ID = 'devframes_plugin_og'
// The SPA ships in the lockstep `@devframes/plugin-og--assets` package,
// served on demand through devframe's remote-assets back-proxy. The definition's
// `importMetaUrl` (below) supplies the default `resolveFrom`, so a locally
// installed copy (a workspace link here) is served with zero network.
const remoteAssets: RemoteAssets = {
  package: `${pkg.name}--assets`,
  version: pkg.version,
}

export interface OgDevframeOptions {
  id?: string
  name?: string
  icon?: string
  basePath?: string
  port?: number
  /** Require the trust handshake. Enabled by default for the network-capable backend. */
  auth?: boolean
  /** URL inspected when the UI does not supply one and baked by `build`. */
  defaultUrl?: string
  /** Override the request implementation, primarily for custom transports and tests. */
  fetch?: OgFetch
}

/**
 * Create the standalone Open Graph viewer definition.
 *
 * @experimental This plugin is experimental and may change without a major
 * version bump until it stabilizes.
 */
export function createOgDevframe(options: OgDevframeOptions = {}): DevframeDefinition {
  const id = options.id ?? DEFAULT_ID
  return defineDevframe({
    id,
    name: options.name ?? 'Open Graph',
    version: pkg.version,
    packageName: pkg.name,
    importMetaUrl: import.meta.url,
    homepage: pkg.homepage,
    description: pkg.description,
    icon: options.icon ?? 'ph:image-square-duotone',
    basePath: options.basePath,
    cli: {
      command: id,
      port: options.port ?? 9016,
      distDir: remoteAssets,
      auth: options.auth ?? true,
    },
    dock: { category: '~builtin' },
    setup(ctx) {
      setupOg(ctx, { defaultUrl: options.defaultUrl, fetch: options.fetch })
    },
  })
}

export default createOgDevframe
export type { OgFetch, OgHeadTag, OgHeadTagName, OgResolveInput, OgSnapshot } from './types'
