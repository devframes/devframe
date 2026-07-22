// Shared constants used by both the node devframe and the browser SPA.

/** Author-supplied, stable view id. */
export const VIEW_ID = 'dashboard'

/**
 * The view's shared-state key. `createJsonRenderView` derives it as
 * `devframe:json-render:<scope>:<id>`; the base context's scope is `global`.
 * The SPA subscribes to this key directly. (A view's serializable
 * `JsonRenderViewRef` carries the same `stateKey`.)
 */
export const STATE_KEY = `devframe:json-render:global:${VIEW_ID}`

// Spec action names dispatched by the bridge — each is an RPC method the server
// registers.
export const REFRESH_ACTION = 'minimal-json-render:refresh'
export const DEPLOY_ACTION = 'minimal-json-render:deploy'
export const SAVE_ACTION = 'minimal-json-render:save'
