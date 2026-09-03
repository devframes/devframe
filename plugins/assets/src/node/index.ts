import type { DevframeDefinition, RemoteAssets } from 'devframe'
import process from 'node:process'
import { defineDevframe } from 'devframe'
import { resolve } from 'pathe'
import pkg from '../../package.json' with { type: 'json' }
import { DEFAULT_PORT } from './constants'
import { setupAssets } from './setup'
import { DEFAULT_ALLOWED_UPLOAD_EXTENSIONS } from './types'

export type { AssetImageMeta, AssetInfo, AssetType, CodeSnippet } from './types'
export { DEFAULT_ALLOWED_UPLOAD_EXTENSIONS } from './types'

// The SPA ships in the lockstep `@devframes/plugin-assets--assets` package,
// served on demand through devframe's remote-assets back-proxy. The definition's
// `importMetaUrl` (below) supplies the default `resolveFrom`, so a locally
// installed copy (a workspace link here) is served with zero network.
const remoteAssets: RemoteAssets = {
  package: `${pkg.name}--assets`,
  version: pkg.version,
}

const DEFAULT_ID = 'devframes_plugin_assets'

export interface AssetsDevframeOptions {
  id?: string
  name?: string
  icon?: string
  /**
   * Directory this devframe manages. Defaults to `<cwd>/public`, the
   * conventional static-asset folder for Nuxt, Vite, and most static-site
   * frameworks. Pass an absolute path, or one relative to the devframe's
   * own `cwd`.
   */
  dir?: string
  /**
   * URL base the **host** serves the managed directory at, used to build
   * each asset's `publicPath`. Defaults to `/`; Vite, Nuxt, and most
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
   * Enabled by default; set `false` (or pass `--read-only` on the
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
   * Enabled by default. Set `false` to skip the file watcher, useful when a
   * host mounts the devframe in a short-lived or repeatedly-recreated
   * context (tests, some SSR dev servers) where a background watcher isn't
   * wanted.
   */
  watch?: boolean
  /**
   * Require the trust handshake on the standalone server. Enabled by
   * default, because this devframe can read, write, and delete real files.
   */
  auth?: boolean
  /**
   * Register the `build` CLI subcommand. Disabled by default: a static
   * export can only ever list file metadata from a baked snapshot; there
   * is no live host serving the files, and every write action is inherently
   * excluded from a static dump, so the command would produce a broken,
   * write-less shell of the tool. Opt back in if that degraded export is
   * still useful to you.
   */
  build?: boolean
}

/**
 * Create the assets manager devframe, a framework-neutral port of Nuxt
 * DevTools' Assets tab. Mount it into any host via devframe's adapters, or
 * run it standalone with the bundled CLI (`devframe-assets`).
 *
 * @experimental This plugin is experimental and may change without a major
 * version bump until it stabilizes.
 */
export function createAssetsDevframe(options: AssetsDevframeOptions = {}): DevframeDefinition {
  const id = options.id ?? DEFAULT_ID
  // Resolve the managed dir at factory time (process.cwd() here equals the
  // adapter's ctx.cwd, the same process) so it can be declared as a service-open
  // allowed root before any setup runs. Only matters when `dir` points
  // outside the workspace; an in-workspace `public/` is already allowed.
  const dir = options.dir ? resolve(process.cwd(), options.dir) : resolve(process.cwd(), 'public')
  const distDir = options.distDir ?? remoteAssets
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
    importMetaUrl: import.meta.url,
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
    /**
     * Both wire services are declared, not imperatively installed: devframe
     * constructs them (deep-merging options across every declarer) before
     * setup runs. `service-open` gets the managed dir as an allowed root so
     * out-of-workspace dirs open; the client hits it directly with the
     * dev-only absolute `fsPath`. `service-shiki` backs server-highlighted
     * text previews, with a plain `<pre>` fallback when it isn't advertised.
     */
    services: [
      { package: '@devframes/service-open', options: { roots: [dir] } },
      { package: '@devframes/service-shiki' },
    ],
    async setup(ctx, info) {
      const readOnlyFlag = info?.flags?.readOnly === true
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
