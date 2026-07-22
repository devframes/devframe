// Shared constants for the node devframe. The prebuilt SPA discovers the view
// from the JSON-render view index, so no client-side view id/key is needed.

/** Author-supplied, stable view id. */
export const VIEW_ID = 'dashboard'

// Spec action names dispatched by the bridge — each is an RPC method the server
// registers.
export const REFRESH_ACTION = 'minimal-json-render:refresh'
export const DEPLOY_ACTION = 'minimal-json-render:deploy'
export const SAVE_ACTION = 'minimal-json-render:save'
