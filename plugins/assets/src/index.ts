import type { DevframeDefinition } from 'devframe'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe'
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
  /**
   * URL base the **host** serves the managed directory at, used to build
   * each asset's `publicPath`. Defaults to `/` — Vite, Nuxt, and most
   * frameworks serve their `public/` folder at the site root. Set this to
   * match a non-root deployment base (e.g. Nuxt's `app.baseURL`).
   */
  baseURL?: string
  /**
   * Serve the managed directory's bytes from this devframe itself.
   * Defaults to `false`: when mounted into a host (Vite/Nuxt/…) that host
   * already serves `public/` at {@link baseURL}, so the plugin references
   * those URLs instead of standing up its own route. The standalone CLI
   * sets this to `true` (it is its own host), serving the directory under
   * a dedicated base so it doesn't collide with the SPA at `/`.
   */
  serveStatic?: boolean
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
   * Watch the managed directory in dev mode and push live listing updates.
   * Enabled by default. Set `false` to skip the file watcher — useful when a
   * host mounts the devframe in a short-lived or repeatedly-recreated
   * context (tests, some SSR dev servers) where a background watcher isn't
   * wanted.
   */
  watch?: boolean
  /**
   * Require the trust handshake on the standalone server. Enabled by
   * default — this devframe can read, write, and delete real files.
   */
  auth?: boolean
  /**
   * Register the `build` CLI subcommand. Disabled by default: a static
   * export can only ever list file metadata from a baked snapshot — there
   * is no live host serving the files, and every write action is inherently
   * excluded from a static dump — so the command would produce a broken,
   * write-less shell of the tool. Opt back in if that degraded export is
   * still useful to you.
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
  const serveStatic = options.serveStatic ?? false
  // When self-serving (standalone CLI), mount under a dedicated base so the
  // asset bytes don't collide with the SPA served at `/`. Otherwise trust the
  // host to serve `public/` at `baseURL` (default `/`).
  const baseURL = options.baseURL ?? (serveStatic ? `/__${id}-raw/` : '/')

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
    dock: { category: '~builtin' },
    async setup(ctx, info) {
      const readOnlyFlag = info?.flags?.readOnly === true
      const dir = options.dir ? resolve(ctx.cwd, options.dir) : resolve(ctx.cwd, 'public')
      await setupAssets(ctx, {
        dir,
        write: readOnlyFlag ? false : write,
        uploadExtensions: options.uploadExtensions ?? DEFAULT_ALLOWED_UPLOAD_EXTENSIONS,
        baseURL,
        serveStatic,
        watch: options.watch ?? true,
      })
    },
  })
}

export default createAssetsDevframe
