export { createActionBridge } from './action-bridge'
export type { ActionBridgeRpc, JsonRenderActionBridge, JsonRenderActionError } from './action-bridge'

export * from './components'
export { createJsonRenderDockRenderer } from './dock-renderer'
export type {
  JsonRenderDockMountOptions,
  JsonRenderDockRenderer,
  JsonRenderDockRendererOptions,
} from './dock-renderer'

export { baseRegistry, ERROR_COMPONENT_TYPE, UNSUPPORTED_COMPONENT_TYPE } from './registry'
export { createRenderer, JsonRenderView, sanitizeSpec } from './renderer'
export type { CreateRendererOptions } from './renderer'
