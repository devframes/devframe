import type { DevframeDefinition } from 'devframe/types'
import type { DevframeViewIframe } from '../types/docks'
import type { DevframeHubContext } from './context'
import { resolveBasePath } from 'devframe/node/hub-internals'
import { resolve } from 'pathe'
import { diagnostics } from './diagnostics'

export interface MountDevframeOptions {
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
 * Framework-neutral primitive — mounts a {@link DevframeDefinition} as a
 * dock inside a hub-aware context: serves the devframe's SPA at the
 * resolved base path, synthesizes an iframe dock entry from the
 * definition's metadata, and runs the definition's `setup(ctx)`.
 *
 * Framework kits wrap this with their own plugin/middleware machinery —
 * e.g. `@vitejs/devtools-kit`'s `createPluginFromDevframe` returns a
 * Vite `Plugin` whose `devtools.setup` ultimately delegates here.
 */
export async function mountDevframe(
  ctx: DevframeHubContext,
  d: DevframeDefinition,
  options: MountDevframeOptions = {},
): Promise<void> {
  const strategy = d.duplicationStrategy ?? 'warn'
  const isDuplicate = ctx.docks.views.has(d.id)

  if (isDuplicate && strategy !== 'duplicate') {
    if (strategy === 'throw')
      throw diagnostics.DF8105({ id: d.id, name: d.name })
    if (strategy === 'warn')
      diagnostics.DF8105({ id: d.id, name: d.name })
    // 'warn' and 'silent' both deduplicate: keep the first registration
    // and drop this later one.
    return
  }

  // The 'duplicate' strategy lets instances coexist, so the dock id (and,
  // when auto-derived, the mount path) is disambiguated to avoid clashing
  // with the already-mounted instance.
  const id = isDuplicate ? nextAvailableDockId(ctx.docks.views, d.id) : d.id
  const base = options.base
    ?? (id === d.id
      ? resolveBasePath(d, 'hosted')
      : resolveBasePath({ ...d, id, basePath: undefined }, 'hosted'))

  if (d.cli?.distDir) {
    ctx.views.hostStatic(base, resolve(d.cli.distDir))
    // Serve the hub's connection meta under the devframe's base so its SPA
    // discovers the RPC/WS endpoint via `connectDevframe()`'s relative
    // `./__connection.json` fetch — instead of relying on inheriting it from a
    // same-origin parent window (which breaks for cross-origin / sandboxed
    // iframes). A host that omits the hook turns this into silent breakage
    // (empty panels / stuck-loading SPAs), so surface it rather than no-op away.
    if (ctx.host.mountConnectionMeta)
      await ctx.host.mountConnectionMeta(base)
    else
      diagnostics.DF8106({ id, name: d.name, base })
  }

  ctx.docks.register({
    id,
    title: d.name,
    icon: d.icon ?? 'ph:plug-duotone',
    // Definition-level `dock` defaults sit above the name/icon-derived
    // defaults; per-mount `options.dock` overrides them; `type`/`url`
    // (and `id`) stay locked, derived from the definition.
    ...d.dock,
    ...options.dock,
    type: 'iframe',
    url: base,
  } as DevframeViewIframe)

  await d.setup(ctx)
}
