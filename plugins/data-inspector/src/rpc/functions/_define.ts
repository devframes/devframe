import type { DevframeNodeContext } from 'devframe/types'
import { createDefineWrapperWithContext } from 'devframe/rpc'

export const defineDataInspectorRpc = createDefineWrapperWithContext<DevframeNodeContext>()

/** RPC namespace — the plugin id. */
export const NS = 'devframes:plugin:data-inspector'
