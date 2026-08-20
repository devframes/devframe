// Shared between the node-side devframe definition and browser-side client
// entries - a plain string constant with no node/browser-specific imports,
// so it's safe to bundle into either.
//
// Colon-free so it stays a valid `<base><id>/` segment when mounted in a hub.
export const BASE_PATH = '/__devframe-starter/'
