import type { DevframeDefinition } from 'devframe/types'
import type { ClientScriptEntry, DevframeViewIframe } from '../types/docks'
import type { DevframeHubContext, HubMountedFrame } from './context'
import { existsSync } from 'node:fs'
import { resolveClientAssets } from 'devframe/internal'
import { resolveBasePath } from 'devframe/node/hub-internals'
import { basename, dirname, isAbsolute, resolve } from 'pathe'
import { joinURL, withTrailingSlash } from 'ufo'
import { diagnostics } from './diagnostics'

export interface InstallDevframeOptions {
  /**
   * Mount path override. Defaults to `d.basePath` or `/__${d.id}/`.
   */
  base?: string
  /**
   * Per-mount overrides for the auto-synthesized iframe dock entry. Use
   * this to customize the entry's `category`, override the icon, hide it
   * via `when` (or only its dock-bar button via `visibility`), etc. Takes
   * precedence over the definition's own {@link DevframeDefinition.dock}
   * defaults. Cannot change `id`, `type`, or `url`, which are derived from
   * the devframe definition.
   */
  dock?: Partial<Omit<DevframeViewIframe, 'id' | 'type' | 'url'>>
}

/**
 * Find the next free dock id derived from `baseId`. Returns `baseId`
 * when it is unused, otherwise appends `-2`, `-3`, … until a free slot
 * is found. Used by the `'duplicate'` strategy so co-existing instances
 * never collide in the dock registry.
 */
function nextAvailableDockId(views: DevframeHubContext['docks']['views'], baseId: string): string {
  if (!views.has(baseId))
    return baseId
  let n = 2
  while (views.has(`${baseId}-${n}`))
    n++
  return `${baseId}-${n}`
}

/**
 * When a dock's `clientScript.importFrom` is an absolute filesystem path, serve
 * its directory under `<base>__page-script/` and rewrite `importFrom` to that
 * URL. A URL or bare specifier (not existing on disk) passes through untouched.
 */
async function resolvePageScriptClientScript(
  ctx: DevframeHubContext,
  clientScript: ClientScriptEntry | undefined,
  base: string,
): Promise<ClientScriptEntry | undefined> {
  if (!clientScript?.importFrom)
    return clientScript
  const { importFrom } = clientScript
  if (!isAbsolute(importFrom) || !existsSync(importFrom))
    return clientScript
  const scriptBase = withTrailingSlash(joinURL(base, '__page-script'))
  // Route through `views.hostStatic` (not the bare `host.mountStatic`) so the
  // directory lands in `ctx.views.buildStaticDirs`, and a static build bakes
  // it whether it copies statics live during mount or from that list.
  ctx.views.hostStatic(scriptBase, dirname(importFrom))
  return { ...clientScript, importFrom: joinURL(scriptBase, basename(importFrom)) }
}

/**
 * Framework-neutral primitive backing {@link DevframeHubContext.install} -
 * installs a {@link DevframeDefinition} as a dock inside a hub-aware context:
 * serves the devframe's SPA at the resolved base path, synthesizes an iframe
 * dock entry from the definition's metadata, and runs the definition's
 * `setup(ctx)`. Reach for it through `ctx.install(devframe)` rather than
 * calling it directly.
 *
 * Framework kits wrap `ctx.install` with their own plugin/middleware
 * machinery, e.g. `@vitejs/devtools-kit`'s `createPluginFromDevframe`
 * returns a Vite `Plugin` whose `devtools.setup` ultimately delegates here.
 */
/**
 * Phase one of an install: run the duplication guard, serve the SPA + meta,
 * register the iframe dock, and queue the definition's declarative wire
 * services, everything up to (but not including) `setup(ctx)`. Returns a
 * deferred setup thunk, or `null` when the devframe was deduplicated.
 *
 * The hub's initial batch uses this to collect every devframe's services
 * across the whole hub, `ready()` them once, and only then run the setups,
 * so services are ready before any setup, and a plugin can consume a service
 * another plugin declared regardless of mount order.
 */
/**
 * Serve a devframe's SPA (and the hub's connection meta) under `base`, if the
 * definition ships client assets.
 */
async function serveDevframeAssets(
  ctx: DevframeHubContext,
  d: DevframeDefinition,
  id: string,
  base: string,
): Promise<boolean> {
  const clientAssets = resolveClientAssets(d)
  if (!clientAssets)
    return false
  // Serve the hub's connection meta under the devframe's base so its SPA
  // discovers the RPC/WS endpoint via `connectDevframe()`'s relative
  // `./__connection.json` fetch (rather than inheriting cross-origin from a
  // parent window). Mounted before the SPA statics so route-ordered hosts
  // resolve it ahead of the static catch-all; surface a missing hook.
  if (ctx.host.mountConnectionMeta)
    await ctx.host.mountConnectionMeta(base)
  else
    diagnostics.DF8106({ id, name: d.name, base })
  // Resolve the plugin's assets against *its* dependency graph: pass the
  // devframe's own `importMetaUrl` as the default `resolveFrom`.
  ctx.views.hostStatic(base, typeof clientAssets === 'string' ? resolve(clientAssets) : clientAssets, d.importMetaUrl)
  return true
}

/**
 * Whether a devframe stays out of a static hub build: `capabilities.build:
 * false` declares its value inherently live (a terminal, a process proxy),
 * so `buildHub` never mounts it, registers its dock, or bakes its RPCs.
 */
function skippedInStaticBuild(ctx: DevframeHubContext, d: DevframeDefinition): boolean {
  return ctx.mode === 'build' && d.capabilities?.build === false
}

export async function prepareDevframe(
  ctx: DevframeHubContext,
  d: DevframeDefinition,
  options: InstallDevframeOptions = {},
): Promise<(() => Promise<void>) | null> {
  if (skippedInStaticBuild(ctx, d))
    return null

  const strategy = d.duplicationStrategy ?? 'warn'
  const isDuplicate = ctx.docks.views.has(d.id)

  if (isDuplicate && strategy !== 'duplicate') {
    if (strategy === 'throw')
      throw diagnostics.DF8105({ id: d.id, name: d.name })
    if (strategy === 'warn')
      diagnostics.DF8105({ id: d.id, name: d.name })
    // 'warn' and 'silent' both deduplicate: keep the first registration
    // and drop this later one.
    return null
  }

  // The 'duplicate' strategy lets instances coexist, so the dock id (and,
  // when auto-derived, the mount path) is disambiguated to avoid clashing
  // with the already-mounted instance.
  const id = isDuplicate ? nextAvailableDockId(ctx.docks.views, d.id) : d.id
  const base = options.base
    ?? (id === d.id
      ? resolveBasePath(d, 'hosted')
      : resolveBasePath({ ...d, id, basePath: undefined }, 'hosted'))

  // Definition `dock` beneath per-mount `options.dock`. Resolved before the SPA
  // mount so an absolute-path page script is served ahead of the SPA catch-all.
  const dockDefaults = { ...d.dock, ...options.dock }
  const clientScript = await resolvePageScriptClientScript(ctx, dockDefaults.clientScript, base)
  if (clientScript)
    dockDefaults.clientScript = clientScript

  const hasClientAssets = await serveDevframeAssets(ctx, d, id, base)

  ;(ctx.frames as HubMountedFrame[]).push({ id, base, title: d.name, hasClientAssets })

  ctx.docks.register({
    id,
    title: d.name,
    icon: d.icon,
    // `dockDefaults` sits above the name/icon defaults; `type`/`url`/`id` stay
    // locked, derived from the definition.
    ...dockDefaults,
    type: 'iframe',
    url: base,
  } as DevframeViewIframe)

  // Queue the definition's declarative wire services. They're constructed at
  // the `ctx.services.ready()` barrier the hub fires before running setups.
  for (const input of d.services ?? [])
    void ctx.services.install(input, { resolveFrom: d.importMetaUrl })

  return () => Promise.resolve(d.setup(ctx))
}

/**
 * Install a {@link DevframeDefinition} into a hub in one call: serve its SPA,
 * register its dock, ready its services, and run `setup(ctx)`. The imperative
 * counterpart to the hub's declarative `devframes` list (which batches the
 * phases via {@link prepareDevframe}); use it from `configure(ctx)` or
 * wherever you hold the context to plug in an extra devframe after startup.
 */
export async function installDevframe(
  ctx: DevframeHubContext,
  d: DevframeDefinition,
  options: InstallDevframeOptions = {},
): Promise<void> {
  const run = await prepareDevframe(ctx, d, options)
  if (!run)
    return
  // `ready()` is idempotent: after the hub's initial barrier this constructs
  // the just-queued services immediately, before this devframe's setup.
  await ctx.services.ready()
  await run()
}
