import type { DevframeDefinition } from 'devframe/types'
import type { ClientScriptEntry, DevframeViewIframe } from '../types/docks'
import type { DevframeHubContext } from './context'
import { existsSync } from 'node:fs'
import { resolveClientAssets } from 'devframe'
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
   * defaults. Cannot change `id`, `type`, or `url` — those are derived from
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
 * When a dock's `clientScript.importFrom` names an **absolute filesystem path**
 * to a built module, serve its directory under the devframe's mount base
 * (`<base>__page-script/`) and rewrite `importFrom` to that served URL. A URL or
 * bare specifier (distinguished by not existing on disk) passes through
 * untouched, as does an absent client script.
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
  await ctx.host.mountStatic(scriptBase, dirname(importFrom))
  return { ...clientScript, importFrom: joinURL(scriptBase, basename(importFrom)) }
}

/**
 * Framework-neutral primitive backing {@link DevframeHubContext.install} —
 * installs a {@link DevframeDefinition} as a dock inside a hub-aware context:
 * serves the devframe's SPA at the resolved base path, synthesizes an iframe
 * dock entry from the definition's metadata, and runs the definition's
 * `setup(ctx)`. Reach for it through `ctx.install(devframe)` rather than
 * calling it directly.
 *
 * Framework kits wrap `ctx.install` with their own plugin/middleware
 * machinery — e.g. `@vitejs/devtools-kit`'s `createPluginFromDevframe`
 * returns a Vite `Plugin` whose `devtools.setup` ultimately delegates here.
 */
/**
 * Phase one of an install: run the duplication guard, serve the SPA + meta,
 * register the iframe dock, and queue the definition's declarative wire
 * services — everything up to (but not including) `setup(ctx)`. Returns a
 * deferred setup thunk, or `null` when the devframe was deduplicated.
 *
 * The hub's initial batch uses this to collect every devframe's services
 * across the whole hub, `ready()` them once, and only then run the setups —
 * so services are ready before any setup, and a plugin can consume a service
 * another plugin declared regardless of mount order.
 */
export async function prepareDevframe(
  ctx: DevframeHubContext,
  d: DevframeDefinition,
  options: InstallDevframeOptions = {},
): Promise<(() => Promise<void>) | null> {
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

  // Definition-level `dock` beneath per-mount `options.dock`. Resolved before
  // the SPA mount so an absolute-path page script is served ahead of the SPA
  // catch-all.
  const dockDefaults = { ...d.dock, ...options.dock }
  const clientScript = await resolvePageScriptClientScript(ctx, dockDefaults.clientScript, base)
  if (clientScript)
    dockDefaults.clientScript = clientScript

  const clientAssets = resolveClientAssets(d)
  if (clientAssets) {
    // Serve the hub's connection meta under the devframe's base so its SPA
    // discovers the RPC/WS endpoint via `connectDevframe()`'s relative
    // `./__connection.json` fetch — instead of relying on inheriting it from a
    // same-origin parent window (which breaks for cross-origin / sandboxed
    // iframes). A host that omits the hook turns this into silent breakage
    // (empty panels / stuck-loading SPAs), so surface it rather than no-op away.
    //
    // Mounted *before* the SPA statics: route-ordered hosts (h3) resolve the
    // exact meta route ahead of the static catch-all, and connect-style hosts
    // are order-agnostic (their static middleware `next()`s on a miss).
    if (ctx.host.mountConnectionMeta)
      await ctx.host.mountConnectionMeta(base)
    else
      diagnostics.DF8106({ id, name: d.name, base })
    const distSource = clientAssets
    // Resolve the plugin's assets against *its* dependency graph, not the
    // hub's: pass the devframe's own `importMetaUrl` as the default
    // `resolveFrom`.
    ctx.views.hostStatic(base, typeof distSource === 'string' ? resolve(distSource) : distSource, d.importMetaUrl)
  }

  ctx.docks.register({
    id,
    title: d.name,
    icon: d.icon,
    // Dock defaults (definition + per-mount, folded into `dockDefaults`) sit
    // above the name/icon-derived defaults; `type`/`url` (and `id`) stay locked,
    // derived from the definition.
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
 * Install a {@link DevframeDefinition} into a hub in one call — serve its SPA,
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
