import type { DevframeDefinition } from 'devframe/types'
import type { DevframeViewIframe } from '../types/docks'
import type { DevframeHubContext } from './context'
import { resolveBasePath } from 'devframe/node/internal'
import { resolve } from 'pathe'

export interface MountDevframeOptions {
  /**
   * Mount path override. Defaults to `d.basePath` or `/__${d.id}/`.
   */
  base?: string
  /**
   * Overrides for the auto-synthesized iframe dock entry. Use this to
   * customize the entry's `category`, override the icon, hide it via
   * `when`, etc. Cannot change `id`, `type`, or `url` — those are
   * derived from the devframe definition.
   */
  dock?: Partial<Omit<DevframeViewIframe, 'id' | 'type' | 'url'>>
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
  const base = options.base ?? resolveBasePath(d, 'hosted')

  if (d.cli?.distDir) {
    ctx.views.hostStatic(base, resolve(d.cli.distDir))
  }

  ctx.docks.register({
    id: d.id,
    title: d.name,
    icon: d.icon ?? 'ph:plug-duotone',
    ...options.dock,
    type: 'iframe',
    url: base,
  } as DevframeViewIframe)

  await d.setup(ctx)
}
