import type { DevframeClientContext } from './docks'

const CLIENT_CONTEXT_KEY = '__DEVFRAME_HUB_CLIENT_CONTEXT__'

/**
 * Get the global Devframe client context, or `undefined` if not yet initialized.
 */
export function getDevframeClientContext(): DevframeClientContext | undefined {
  return (globalThis as any)[CLIENT_CONTEXT_KEY]
}

export { CLIENT_CONTEXT_KEY }
