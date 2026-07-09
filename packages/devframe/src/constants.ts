// Devframe runtime routes and static output conventions.
export const DEVFRAME_MOUNT_PATH = '/__devframe/'
export const DEVFRAME_MOUNT_PATH_NO_TRAILING_SLASH = '/__devframe'
export const DEVFRAME_DIRNAME = '__devframe'

export const DEVFRAME_CONNECTION_META_FILENAME = '__connection.json'

/**
 * Route the WebSocket RPC endpoint is bound to, relative to a devframe's
 * base path. Sits next to `__connection.json` so the deployed SPA can reach
 * it on the same origin it loaded from — the dev server shares one port for
 * both HTTP and WS, and a host server (Vite, etc.) can mount the WS upgrade
 * handler here without colliding with its own routes (HMR, asset serving).
 */
export const DEVFRAME_WS_ROUTE = '__devframe_ws'
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

/**
 * Page-URL query parameter carrying a one-time authentication code (OTP) for
 * "magic link" auth. A host can print a link like `<origin>/?devframe_otp=<code>`;
 * the client reads the code, exchanges it for a token, and strips the parameter
 * from the URL. See `buildOtpAuthUrl` (node) and the `authenticateWithUrlOtp` /
 * `consumeOtpFromUrl` client utilities (or `connectDevframe`'s `otpParam`).
 */
export const DEVFRAME_OTP_URL_PARAM = 'devframe_otp'

/**
 * WS upgrade-URL query parameter carrying a previously-issued bearer token.
 * Set by `createWsRpcChannel` (browser transport) whenever `authToken` is
 * passed; read at connect time by a host's connect-time trust hook (see
 * `recipes/interactive-auth`'s `onConnect`) so a returning client can be
 * trusted before its own `anonymous:devframe:auth` handshake call arrives.
 */
export const DEVFRAME_AUTH_TOKEN_QUERY_PARAM = 'devframe_auth_token'

/**
 * Prefix that marks an RPC method as callable before a connection is
 * trusted. This is the *only* rule the pre-trust gate applies — there is no
 * per-method allowlist. Any handshake method a host adapter needs to reach
 * before authentication must be named `anonymous:<rest>` (e.g.
 * `anonymous:devframe:auth`).
 */
export const ANONYMOUS_RPC_PREFIX = 'anonymous:'

/**
 * Whether `name` is callable before a connection is trusted, i.e. it starts
 * with {@link ANONYMOUS_RPC_PREFIX}. Used by the resolver gate in
 * `startHttpAndWs` (via an `authorize` function) and by host adapters that
 * implement their own transport.
 */
export function isAnonymousRpcMethod(name: string): boolean {
  return name.startsWith(ANONYMOUS_RPC_PREFIX)
}
