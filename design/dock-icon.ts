// Framework-neutral port of @antfu/design's `DisplayIconifyRemoteIcon`:
// https://github.com/antfu/design/blob/main/packages/design/components/Display/DisplayIconifyRemoteIcon.vue
//
// Resolves a devframe dock `icon` (an Iconify `collection:icon` id, e.g.
// `ph:git-branch-duotone`) to its live, sanitized SVG markup, fetched from the
// public `api.iconify.design` CDN. Unlike a UnoCSS `preset-icons` class, this
// needs no `@iconify-json/*` collection installed and no hand-maintained
// id -> class table, since any Iconify id just works, at the cost of a network
// round-trip on first render. We reuse @antfu/design's own fetcher, cache and
// sanitizer (`utils/iconify.ts`) rather than reimplementing them; only the id
// parsing and light/dark selection below are devframe-specific, mirroring the
// upstream Vue component's own `icon` prop parsing. Vue surfaces should render
// `DisplayIconifyRemoteIcon` directly instead of using this port.
import { getIconifySvg } from '@antfu/design/utils/iconify'

// Mirrors DisplayIconifyRemoteIcon.vue's own `collection:icon` parse (with an
// optional `i-` prefix tolerated so a UnoCSS-style id also works).
const ICONIFY_ID = /^(?:i-)?([\w-]+):([\w-]+)$/

/**
 * Resolve a dock icon (a `collection:icon` string, or a `{ light, dark }`
 * pair whose `light` variant is fetched) to its sanitized SVG markup.
 *
 * Returns `undefined` when the id doesn't parse or the fetch fails, so the
 * caller can fall back to a text initial.
 *
 * @example
 * await dockIconSvg('ph:git-branch-duotone') // → '<svg ...>...</svg>'
 */
export async function dockIconSvg(name: string | { light: string, dark: string } | undefined): Promise<string | undefined> {
  const id = typeof name === 'string' ? name : name?.light
  if (!id)
    return undefined
  const match = id.match(ICONIFY_ID)
  if (!match)
    return undefined
  try {
    return await getIconifySvg(match[1]!, match[2]!)
  }
  catch {
    // A failed fetch (offline / flaky CDN) degrades to the text-initial
    // fallback, not a thrown error out of a render path.
    return undefined
  }
}
