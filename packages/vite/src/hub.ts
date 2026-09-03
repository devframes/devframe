import type { DevframeHubUi, DockRendererRegistration, HubDevframeEntry, HubInstance, InitHubOptions } from '@devframes/hub/initiate'
import type { DevframeHubContext } from '@devframes/hub/node'
import type { ClientScriptEntry } from '@devframes/hub/types'
import type { DevframeDefinition } from 'devframe'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { Server as NodeHttpServer } from 'node:http'
import process from 'node:process'
import { DEVFRAMES_HUB_BASE, normalizeHubBase } from '@devframes/hub/constants'
import { initHub } from '@devframes/hub/initiate'
import { resolve } from 'pathe'

export interface ViteDevframeHubOptions {
  /**
   * Mount base the hub answers under; every frame lives at `<base><id>/`.
   * Default: `/__devframes/`.
   */
  base?: string
  /**
   * Pin a side-car port for the RPC/WS server. By default the WebSocket
   * shares Vite's own HTTP server, upgrading at `<base>__ws`.
   */
  port?: number
  /** Bind host for a pinned side-car server. Default: `localhost`. */
  host?: string
  /**
   * Devframes to mount as docks. Wrap an entry in `{ devframe, dock }` to
   * customize its synthesized iframe dock (category, `frameId`, `subTabs`, …).
   */
  devframes?: InitHubOptions['devframes']
  /**
   * Per-dock client scripts, keyed by devframe id. Attached to the mounted
   * iframe dock so the hub client runtime imports them into the host page
   * (e.g. the a11y inspector's in-page agent).
   */
  clientScripts?: Record<string, ClientScriptEntry>
  /**
   * Prebuilt dock-renderer modules forwarded to `initHub({ renderers })`,
   * each served at `<base>__renderers/<type>.mjs` and published in the
   * renderer manifest (e.g. `jsonRenderUiRenderer()` from
   * `@devframes/json-render-ui/hub`).
   */
  renderers?: readonly DockRendererRegistration[]
  /**
   * Extra RPC declarations registered at context creation, alongside the hub
   * built-ins.
   */
  rpcDeclarations?: InitHubOptions['rpcDeclarations']
  /**
   * Runs once the context exists and every `devframes` entry is mounted;
   * register docks, commands, terminals, and messages surfaces here.
   */
  configure?: (ctx: DevframeHubContext) => void | Promise<void>
  /**
   * The hub's UI slot. Defaults to `@devframes/hub-ui`'s `createUi()` (the
   * reference floating dock + standalone viewer) when omitted, so install
   * `@devframes/hub-ui` for that default. Pass your own {@link DevframeHubUi}
   * to swap the hub UI provider, or `false` for a headless hub (serve your own UI
   * against `@devframes/hub/client`).
   */
  ui?: DevframeHubUi | false
  /**
   * The hub's single auth gate. Gates by default (interactive OTP); `false`
   * opts out for a single-user localhost host.
   */
  auth?: InitHubOptions['auth']
  /**
   * Expose the aggregate MCP endpoint at `<base>__mcp`.
   */
  mcp?: InitHubOptions['mcp']
  /** Publish this hub in the global instance registry. Default: off. */
  register?: InitHubOptions['register']
  /** Public origin the host app is reachable at, or a getter. */
  origin?: InitHubOptions['origin']
  /** Working directory for the hub context. Default: Vite's project root. */
  cwd?: string
  /** Override where persisted devframe state lives. */
  getStorageDir?: InitHubOptions['getStorageDir']
  /** Name for the hub instance (logs, diagnostics, MCP server). */
  name?: string
  /** Version for the hub instance (logs, diagnostics, MCP server). */
  version?: string
  /**
   * Silence the notice recommending Vite DevTools. See {@link viteDevframeHub}.
   *
   * @default false
   */
  quiet?: boolean
  /**
   * Also bake the hub into `vite build` output: `buildHub` writes the whole
   * static hub subtree (each devframe's SPA, the RPC dump, `embedded.js`, …)
   * into `<outDir><base>`, and the UI's `embedded.js` script tag is injected
   * into the built HTML, so the deployed app ships working devtools against
   * a `static` backend (baked reads, no live server). Off by default: a
   * production bundle only carries devtools when the host opts in.
   *
   * @default false
   */
  build?: boolean
}

let recommendedViteDevtools = false

function recommendViteDevtools(): void {
  if (recommendedViteDevtools)
    return
  recommendedViteDevtools = true
  console.warn(
    '[@devframes/vite/hub] Serving a devframes-hub directly inside Vite works, '
    + 'but Vite DevTools (`@vitejs/devtools-kit`) integrates the hub protocol '
    + 'natively, so prefer it for a first-class, multi-integration experience. '
    + 'Pass `{ quiet: true }` to silence this notice.',
  )
}

/**
 * Mount a whole **devframes-hub** (many integrations under one namespace,
 * one merged RPC registry, one WebSocket) inside an existing Vite dev
 * server. One `initHub()` call, mounted as connect middleware; the WebSocket
 * shares Vite's own HTTP server (upgrading at `<base>__ws`) unless a `port`
 * pins a side-car. The UI defaults to `@devframes/hub-ui` (its `embedded.js`
 * bootstrap is injected into the host page automatically); pass `ui` to swap
 * it or `ui: false` for a headless hub you drive with `@devframes/hub/client`.
 *
 * This mounts one integration-agnostic hub. Vite DevTools
 * (`@vitejs/devtools-kit`) integrates the same hub protocol natively and is
 * the recommended path for a Vite app, so this plugin emits a one-time notice
 * to that effect (silence it with `{ quiet: true }`). For dev-serving a
 * single devframe's own SPA, reach for `@devframes/vite/single` instead.
 */
export function viteDevframeHub(options: ViteDevframeHubOptions = {}): Plugin {
  const base = normalizeHubBase(options.base ?? DEVFRAMES_HUB_BASE)
  let viteConfig: ResolvedConfig | undefined
  let instance: HubInstance | undefined
  // Set once the hub is up if its UI ships an `embedded.js` bootstrap: the
  // host-page script tag `transformIndexHtml` injects.
  let embeddedSrc: string | undefined
  // Resolved once for a static build, shared by `buildStart` (embedded.js
  // injection) and `closeBundle` (the buildHub emit).
  let buildUi: DevframeHubUi | undefined

  const teardown = async (): Promise<void> => {
    const previous = instance
    instance = undefined
    await previous?.close().catch(() => {})
  }

  const resolveUi = async (): Promise<DevframeHubUi | undefined> =>
    options.ui === false ? undefined : options.ui ?? await loadDefaultUi()

  return {
    name: 'devframes:hub',
    /**
     * Dev middleware by default; a production bundle only carries the hub
     * when the host opts into the static build.
     */
    apply: (_, env) => env.command === 'serve' || options.build === true,

    configResolved(config) {
      viteConfig = config
    },

    async configureServer(server: ViteDevServer) {
      if (!options.quiet)
        recommendViteDevtools()

      // Vite re-invokes `configureServer` on each restart, so tear down the
      // previous instance so we don't leak the WS binding or a registry record.
      await teardown()

      const cwd = options.cwd ?? viteConfig?.root ?? process.cwd()

      // Resolve the UI slot: default to `@devframes/hub-ui`'s `createUi()`
      // (lazy import so `@devframes/hub-ui` stays an optional dependency),
      // honor an explicit object, or stay headless on `false`.
      const ui = await resolveUi()

      // Attach each configured client script to its devframe's mount entry so
      // the hub client runtime imports it into the host page.
      const devframes = attachClientScripts(options.devframes, options.clientScripts)

      const httpServer = server.httpServer instanceof NodeHttpServer ? server.httpServer : undefined

      const hub = initHub({
        base,
        cwd,
        /**
         * Bare-specifier client scripts resolve through Vite's own module
         * graph: `/@id/<specifier>` routes the import (and its transitive
         * bare imports) through Vite's resolution and import-analysis.
         */
        clientModuleResolution: '/@id/{specifier}',
        origin: options.origin ?? (() => {
          const resolved = server.resolvedUrls?.local?.[0]
          return resolved ? new URL(resolved).origin : ''
        }),
        auth: options.auth,
        /**
         * Share Vite's own HTTP server for the WS upgrade at `<base>__ws`, with no
         * side-car port to discover. A pinned `port` uses a side-car instead;
         * an https/http2 dev server (non-`node:http`) asks for an auto-port
         * side-car. Clients discover either via `__connection.json`.
         */
        server: httpServer,
        ...resolveWsBinding(options.port, httpServer),
        ...(ui ? { ui } : {}),
        devframes,
        ...pickDefined(options, ['host', 'renderers', 'rpcDeclarations', 'mcp', 'register', 'getStorageDir', 'name', 'version', 'configure']),
      })
      instance = hub
      embeddedSrc = ui?.embedded ? `${base}embedded.js` : undefined

      // One namespace, one catch-all: the middleware serves everything under
      // `base` and `next()`s the rest back to Vite.
      server.middlewares.use(hub.nodeMiddleware)

      server.httpServer?.once('close', () => {
        if (instance !== hub)
          return
        void teardown()
      })
    },

    async buildStart() {
      // Static build: resolve the UI slot up front so `transformIndexHtml`
      // (which runs before the bundle closes) knows whether to inject the
      // `embedded.js` bootstrap into the built HTML.
      if (viteConfig?.command !== 'build' || !options.build)
        return
      buildUi = await resolveUi()
      embeddedSrc = buildUi?.embedded ? `${base}embedded.js` : undefined
    },

    transformIndexHtml() {
      // Inject the floating-dock bootstrap when the resolved UI ships one.
      if (!embeddedSrc)
        return
      return [{
        tag: 'script',
        attrs: { type: 'module', src: embeddedSrc },
        injectTo: 'body',
      }]
    },

    async closeBundle() {
      await teardown()

      // Static build: bake the whole hub into the app's build output at
      // `<outDir><base>`, so the deployed bundle serves working devtools
      // (baked reads over the `static` backend) from any static file server.
      if (viteConfig?.command !== 'build' || !options.build)
        return
      const cwd = options.cwd ?? viteConfig.root
      const { buildHub } = await import('@devframes/hub/build')
      await buildHub({
        base,
        cwd,
        outDir: resolve(viteConfig.root, viteConfig.build.outDir, base.slice(1)),
        devframes: attachClientScripts(options.devframes, options.clientScripts) ?? [],
        ...(buildUi ? { ui: buildUi } : {}),
        ...pickDefined(options, ['renderers', 'rpcDeclarations', 'getStorageDir', 'name', 'version', 'configure']),
      })
    },
  }
}

/**
 * Share Vite's own HTTP server for the WS upgrade unless a `port` pins a
 * side-car, or the dev server isn't a plain `node:http` server (https/http2),
 * which needs an auto-port side-car.
 */
function resolveWsBinding(port: number | undefined, httpServer: NodeHttpServer | undefined): { ws?: { port: number } | { sidecar: true } } {
  if (port != null)
    return { ws: { port } }
  return httpServer ? {} : { ws: { sidecar: true } }
}

/** Forward only the options a caller actually set. */
function pickDefined<T, K extends keyof T>(source: T, keys: readonly K[]): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {}
  for (const key of keys) {
    const value = source[key]
    if (value != null)
      out[key] = value
  }
  return out
}

/** Lazy-load `@devframes/hub-ui`'s default UI so it stays an optional dep. */
async function loadDefaultUi(): Promise<DevframeHubUi> {
  const { createUi } = await import('@devframes/hub-ui')
  return createUi()
}

/** Attach per-id client scripts to their devframe mount entries. */
function attachClientScripts(
  devframes: InitHubOptions['devframes'],
  clientScripts: Record<string, ClientScriptEntry> | undefined,
): InitHubOptions['devframes'] {
  if (!devframes || !clientScripts)
    return devframes
  return devframes.map((entry) => {
    // Leave thenables / factories untouched; they resolve to their own entries.
    if (typeof entry === 'function' || entry instanceof Promise)
      return entry
    const def = (entry && typeof entry === 'object' && 'devframe' in entry
      ? (entry as HubDevframeEntry).devframe
      : entry) as DevframeDefinition | undefined
    const clientScript = def ? clientScripts[def.id] : undefined
    if (!def || !clientScript)
      return entry
    return 'devframe' in (entry as object)
      ? { ...(entry as HubDevframeEntry), dock: { clientScript, ...(entry as HubDevframeEntry).dock } }
      : { devframe: def, dock: { clientScript } }
  })
}
