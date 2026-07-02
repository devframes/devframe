import type { DevframeClientContext } from './docks'

const CLIENT_CONTEXT_KEY = '__DEVFRAME_HUB_CLIENT_CONTEXT__'

/**
 * Get the global Devframe client context, or `undefined` if not yet initialized.
 */
export function getDevframeClientContext(): DevframeClientContext | undefined {
  return (globalThis as any)[CLIENT_CONTEXT_KEY]
}

/**
 * Publish the global Devframe client context (or clear it with `undefined`).
 * Called by {@link import('./host').createDevframeClientHost}; a dock client
 * script or a viewer reads it back with {@link getDevframeClientContext}.
 */
export function setDevframeClientContext(ctx: DevframeClientContext | undefined): void {
  (globalThis as any)[CLIENT_CONTEXT_KEY] = ctx
}

export { CLIENT_CONTEXT_KEY }
