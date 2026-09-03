import type { DevframeDefinition, DevframeNodeContext, StaticAssetsSource } from 'devframe/types'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import { resolveClientAssets as resolveClientAssetsInternal } from './client-assets'

export const defineRpcFunction = createDefineWrapperWithContext<DevframeNodeContext>()

/**
 * Identity helper that types a devframe definition, the primary authoring
 * entry point. Import it from the package root: `import { defineDevframe } from 'devframe'`.
 */
export function defineDevframe(d: DevframeDefinition): DevframeDefinition {
  return d
}

/**
 * @deprecated Read {@link DevframeDefinition.clientAssets} from the definition
 * directly. This helper is internal machinery that was never meant to be part
 * of the public API and is scheduled for removal.
 */
export function resolveClientAssets(d: DevframeDefinition): StaticAssetsSource | undefined {
  return resolveClientAssetsInternal(d)
}
