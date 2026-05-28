// Devframe runtime routes and static output conventions.
export const DEVFRAME_MOUNT_PATH = '/__devframe/'
export const DEVFRAME_MOUNT_PATH_NO_TRAILING_SLASH = '/__devframe'
export const DEVFRAME_DIRNAME = '__devframe'

export const DEVFRAME_CONNECTION_META_FILENAME = '__connection.json'
export const DEVFRAME_RPC_DUMP_MANIFEST_FILENAME = '__rpc-dump/index.json'
export const DEVFRAME_DOCK_IMPORTS_FILENAME = '__client-imports.js'
export const DEVFRAME_DOCK_IMPORTS_VIRTUAL_ID = '/__devframe-client-imports.js'
export const DEVFRAME_RPC_DUMP_DIRNAME = '__rpc-dump'

/**
 * URL fragment / query parameter name carrying the remote dock
 * connection descriptor (defined as `RemoteConnectionInfo` in
 * `@vitejs/devtools-kit`) injected into remote-UI iframe dock URLs.
 */
export const REMOTE_CONNECTION_KEY = 'devframe-remote-connection'
