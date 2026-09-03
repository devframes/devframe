import type { DevframeServiceInput, DevframeStorageScope } from 'devframe/types'
import type { BakeHubStaticOptions } from './bake'
import type { CreateHubContextOptions, DevframeHubContext } from './context'
import type { DevframeHubUi, DevframesInput } from './initiate'
import process from 'node:process'
import { createH3DevframeHost } from 'devframe/internal'
import { resolve } from 'pathe'
import { DEVFRAMES_HUB_BASE, normalizeHubBase } from '../constants'
import { mountDevframes, resolveDevframesInput } from './assemble'
import { bakeHubStatic } from './bake'
import { createHubContext } from './context'

export type { BakeHubStaticOptions } from './bake'
export { bakeHubStatic } from './bake'

export interface BuildHubOptions extends Omit<BakeHubStaticOptions, 'outDir'> {
  /**
   * Output directory the hub subtree is written into. It corresponds to the
   * hub {@link BuildHubOptions.base} at serve time: building with
   * `base: '/__devframes/'` into `dist/__devframes` makes the deployed app's
   * `dist/` servable as-is by any static file server.
   */
  outDir: string
  /** Devframes to bake as docks, same input as `initHub({ devframes })`. */
  devframes?: DevframesInput
  /** Host-level wire services, same contract as `initHub({ services })`. */
  services?: DevframeServiceInput[]
  /** Extra RPC declarations registered at context creation. */
  rpcDeclarations?: CreateHubContextOptions['builtinRpcDeclarations']
  /**
   * Runs once the context exists and every `devframes` entry is mounted;
   * register docks, commands, and messages surfaces here, exactly like
   * `initHub({ configure })`. Everything it registers is baked into the
   * static shared-state snapshot.
   */
  configure?: (ctx: DevframeHubContext) => void | Promise<void>
  /**
   * The hub's UI slot: the viewer SPA is copied to the hub base, the
   * `embedded.js` bootstrap next to it, and `setup(ctx)` runs so its static
   * config (branding, dock preferences) is baked into the connection meta.
   */
  ui?: DevframeHubUi
  /** Working directory for the hub context. Default: `process.cwd()`. */
  cwd?: string
  /** Override where persisted devframe state lives during the build. */
  getStorageDir?: (scope: DevframeStorageScope) => string
}

/**
 * Produce a self-contained static deploy of a whole hub, the multi-devframe
 * counterpart of devframe's `createBuild`. Composes the pipeline from its two
 * public halves: build a `mode: 'build'` hub context and mount every devframe
 * ({@link createHubContext} + {@link mountDevframes}), then bake it
 * ({@link bakeHubStatic}). A host that assembles its own context (Vite
 * DevTools' kit context, devframes mounted from Vite plugins) skips this and
 * calls `bakeHubStatic` directly.
 *
 *   - Each SPA is copied to `<outDir>/<id>/`, an absolute-path page script to
 *     `<outDir>/<id>/__page-script/`, and its `setup(ctx)` runs.
 *   - The UI slot's viewer SPA, `embedded.js`, and the renderer modules are
 *     copied, and the discovery documents written (`__index.json`,
 *     `__client-imports.js`).
 *   - `__connection.json` (`{ backend: 'static' }`, carrying `ctx.staticConfig`
 *     as `configs`) is written at the hub base and every frame base.
 *   - The shared RPC dump is baked under `<outDir>/__rpc-dump/`, so
 *     `createDevframeClientRuntime` and every frame SPA boot from the dump with
 *     no live server.
 *
 * Reads work from the baked dump; live writes (messages, terminals, commands
 * execution) have no server and degrade to no-ops in the clients.
 */
export async function buildHub(options: BuildHubOptions): Promise<void> {
  const base = normalizeHubBase(options.base ?? DEVFRAMES_HUB_BASE)
  const cwd = options.cwd ?? process.cwd()

  // A build host whose `mountStatic` is a no-op: `bakeHubStatic` copies every
  // static from `ctx.views.buildStaticDirs`, so nothing needs to be served
  // live during mounting.
  const h3Host = createH3DevframeHost({
    origin: 'http://localhost',
    appName: 'devframes',
    workspaceRoot: cwd,
    mount: () => {},
  })
  const host = {
    ...h3Host,
    ...(options.getStorageDir ? { getStorageDir: options.getStorageDir } : {}),
    /**
     * Serving each frame's meta live is unnecessary in a build: `bakeHubStatic`
     * writes the per-frame metas from `ctx.frames`.
     */
    mountConnectionMeta: () => {},
  }

  const ctx = await createHubContext({
    cwd,
    workspaceRoot: cwd,
    mode: 'build',
    host,
    ...(options.rpcDeclarations ? { builtinRpcDeclarations: options.rpcDeclarations } : {}),
  })

  const devframes = await resolveDevframesInput(options.devframes ?? [])
  for (const input of options.services ?? [])
    void ctx.services.install(input)
  const setups = await mountDevframes(ctx, devframes, base, false)

  await ctx.services.ready()
  for (const run of setups)
    await run()

  await options.configure?.(ctx)
  await options.ui?.setup?.(ctx)

  await bakeHubStatic(ctx, {
    outDir: resolve(cwd, options.outDir),
    base,
    ...(options.ui ? { ui: options.ui } : {}),
    ...(options.renderers ? { renderers: options.renderers } : {}),
    ...(options.name !== undefined ? { name: options.name } : {}),
    ...(options.version !== undefined ? { version: options.version } : {}),
    ...(options.pretty !== undefined ? { pretty: options.pretty } : {}),
    ...(options.clean !== undefined ? { clean: options.clean } : {}),
  })
}
