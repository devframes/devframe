import type { DevframeDefinition, DevframeNodeContext } from 'devframe/types'
import { createDefineWrapperWithContext } from 'devframe/rpc'

export const defineRpcFunction = createDefineWrapperWithContext<DevframeNodeContext>()

/**
 * Identity helper that types a devframe definition — the primary authoring
 * entry point. Import it from the package root: `import { defineDevframe } from 'devframe'`.
 */
export function defineDevframe(d: DevframeDefinition): DevframeDefinition {
  return d
}
