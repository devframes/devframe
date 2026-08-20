import type { DevframeDefinition, DevframeNodeContext, StaticAssetsSource } from 'devframe/types'
import { createDefineWrapperWithContext } from 'devframe/rpc'

export const defineRpcFunction = createDefineWrapperWithContext<DevframeNodeContext>()

/**
 * Identity helper that types a devframe definition — the primary authoring
 * entry point. Import it from the package root: `import { defineDevframe } from 'devframe'`.
 */
export function defineDevframe(d: DevframeDefinition): DevframeDefinition {
  return d
}

/**
 * Resolve a definition's client assets source — the built SPA served as its
 * UI. Prefers the top-level {@link DevframeDefinition.clientAssets} and falls
 * back to the deprecated {@link DevframeCliOptions.distDir}, so both the new
 * and legacy shapes resolve. Returns `undefined` when neither is set (bridge
 * mode — the SPA is hosted elsewhere).
 */
export function resolveClientAssets(d: DevframeDefinition): StaticAssetsSource | undefined {
  return d.clientAssets ?? d.cli?.distDir
}
