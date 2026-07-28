import type { DevframeDefinition } from 'devframe/types'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import { dirname, resolve } from 'pathe'
import pkg from '../package.json' with { type: 'json' }
import { DEFAULT_PORT } from './constants'
import { setupAssets } from './node/index'
import { DEFAULT_ALLOWED_UPLOAD_EXTENSIONS } from './types'

export type { AssetImageMeta, AssetInfo, AssetType, CodeSnippet } from './types'
export { DEFAULT_ALLOWED_UPLOAD_EXTENSIONS } from './types'

// Package root, resolved one level up from this module — which sits at
// `<root>/src/index.ts` in dev and `<root>/dist/index.mjs` once built, so
// the bundled SPA is always `<root>/dist/spa`.
const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

const DEFAULT_ID = 'devframes_plugin_assets'

export interface AssetsDevframeOptions {
  id?: string
  name?: string
  icon?: string
  /**
   * Directory this devframe manages. Defaults to `<cwd>/public` — the
   * conventional static-asset folder for Nuxt, Vite, and most static-site
   * frameworks. Pass an absolute path, or one relative to the devframe's
   * own `cwd`.
   */
  dir?: string
  basePath?: string
  distDir?: string
  /** Preferred standalone CLI port (default 9015). */
  port?: number
  /**
   * Enable upload, rename, delete, and folder creation from the UI.
   * Enabled by default — set `false` (or pass `--read-only` on the
   * standalone CLI) for a browse-only deployment.
   */
  write?: boolean
  /**
   * Extensions `upload` accepts, or `'*'` to accept any file. Defaults to
   * the same allow-list Nuxt DevTools ships.
   */
  uploadExtensions?: readonly string[] | '*'
  /**
   * Require the trust handshake on the standalone server. Enabled by
   * default — this devframe can read, write, and delete real files.
   */
  auth?: boolean
  /**
   * Register the `build` CLI subcommand. Disabled by default: a static
   * export can only ever list file metadata from a baked snapshot — real
   * previews need `ctx.views.hostStatic()`'s live byte serving, and every
   * write action is inherently excluded from a static dump — so the
   * command would produce a broken, write-less shell of the tool. Opt
   * back in if that degraded export is still useful to you.
   */
  build?: boolean
}

/**
 * Create the assets manager devframe — a framework-neutral port of Nuxt
 * DevTools' Assets tab. Mount it into any host via devframe's adapters, or
 * run it standalone with the bundled CLI (`devframe-assets`).
 *
 * @experimental This plugin is experimental and may change without a major
 * version bump until it stabilizes.
 */
export function createAssetsDevframe(options: AssetsDevframeOptions = {}): DevframeDefinition {
  const id = options.id ?? DEFAULT_ID
  const distDir = options.distDir ?? resolve(PKG_ROOT, 'dist/spa')
  const write = options.write ?? true
  const rawBase = `/__${id}-raw/`

  return defineDevframe({
    id,
    name: options.name ?? 'Assets',
    version: pkg.version,
    packageName: pkg.name,
    homepage: pkg.homepage,
    description: pkg.description,
    icon: options.icon ?? 'ph:image-square-duotone',
    basePath: options.basePath,
    capabilities: { build: options.build ?? false },
    cli: {
      command: 'devframe-assets',
      port: options.port ?? DEFAULT_PORT,
      distDir,
      auth: options.auth ?? true,
      configure(cli) {
        cli.option('--read-only', 'Disable upload, rename, delete, and folder creation')
      },
    },
    spa: { loader: 'none' },
    dock: { category: '~builtin' },
    async setup(ctx, info) {
      const readOnlyFlag = info?.flags?.readOnly === true
      const dir = options.dir ? resolve(ctx.cwd, options.dir) : resolve(ctx.cwd, 'public')
      await setupAssets(ctx, {
        dir,
        write: readOnlyFlag ? false : write,
        uploadExtensions: options.uploadExtensions ?? DEFAULT_ALLOWED_UPLOAD_EXTENSIONS,
        rawBase,
      })
    },
  })
}

const assetsDevframe: DevframeDefinition = createAssetsDevframe()

export default assetsDevframe
