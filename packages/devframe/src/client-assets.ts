import type { DevframeDefinition, StaticAssetsSource } from 'devframe/types'

/**
 * Resolve a definition's client assets source: the built SPA served as its
 * UI. Prefers the top-level {@link DevframeDefinition.clientAssets} and falls
 * back to the deprecated `cli.distDir`, so both the new and legacy shapes
 * resolve. Returns `undefined` when neither is set (bridge mode, where the SPA is
 * hosted elsewhere).
 *
 * Internal: exposed to first-party integrations via `devframe/internal`, not
 * part of the stable public API.
 */
export function resolveClientAssets(d: DevframeDefinition): StaticAssetsSource | undefined {
  return d.clientAssets ?? d.cli?.distDir
}
