import type { BirpcOptions, BirpcReturn } from 'birpc'
import type { RpcCacheOptions, RpcFunctionsCollector } from 'devframe/rpc'
import type { WsRpcChannelOptions } from 'devframe/rpc/transports/ws-client'
import type { ConnectionMeta, DevframeRpcClientFunctions, DevframeRpcServerFunctions, EventEmitter, RpcSharedStateHost, SettingsForNamespace } from 'devframe/types'
import type { RpcStreamingClientHost } from './rpc-streaming'
import type { DevframeScopedClientContext } from './scope'
import {
  DEVFRAME_CONNECTION_META_FILENAME,
  DEVFRAME_OTP_URL_PARAM,
} from 'devframe/constants'
import { RpcCacheManager, RpcFunctionsCollectorBase } from 'devframe/rpc'
import { createEventEmitter } from 'devframe/utils/events'
import { withBase } from 'ufo'
import { authenticateWithUrlOtp } from './otp'
import { createRpcSharedStateClientHost } from './rpc-shared-state'
import { createStaticRpcClientMode } from './rpc-static'
import { createRpcStreamingClientHost } from './rpc-streaming'
import { createWsRpcClientMode } from './rpc-ws'
import { createScopedClientContext } from './scope'

export interface DevframeRpcContext {
  /**
   * The RPC client to interact with the server
   */
  readonly rpc: DevframeRpcClient
}

export type DevframeClientRpcHost = RpcFunctionsCollector<DevframeRpcClientFunctions, DevframeRpcContext>

export interface RpcClientEvents {
  'rpc:is-trusted:updated': (isTrusted: boolean) => void
}

const CONNECTION_META_KEY = '__DEVFRAME_CONNECTION_META__'
const CONNECTION_AUTH_TOKEN_KEY = '__DEVFRAME_CONNECTION_AUTH_TOKEN__'

export interface DevframeRpcClientOptions {
  connectionMeta?: ConnectionMeta
  baseURL?: string | string[]
  /**
   * The auth token to use for the client
   */
  authToken?: string
  /**
   * Query-param name on the page URL carrying a one-time authentication code
   * (OTP) for "magic link" auth (e.g. a link the dev server prints). When
   * present, the client exchanges the code for a token and removes the parameter
   * from the URL. Set `false` to disable — e.g. integrations that drive their
   * own authentication via `authenticateWithUrlOtp`. Default: `'devframe_otp'`.
   */
  otpParam?: string | false
  wsOptions?: Partial<WsRpcChannelOptions>
  rpcOptions?: Partial<BirpcOptions<DevframeRpcServerFunctions, DevframeRpcClientFunctions, boolean>>
  cacheOptions?: boolean | Partial<RpcCacheOptions>
}

export type DevframeRpcClientCall = BirpcReturn<DevframeRpcServerFunctions, DevframeRpcClientFunctions>['$call']
export type DevframeRpcClientCallEvent = BirpcReturn<DevframeRpcServerFunctions, DevframeRpcClientFunctions>['$callEvent']
export type DevframeRpcClientCallOptional = BirpcReturn<DevframeRpcServerFunctions, DevframeRpcClientFunctions>['$callOptional']

export interface DevframeRpcClient {
  /**
   * The events of the client
   */
  events: EventEmitter<RpcClientEvents>

  /**
   * Whether the client is trusted
   */
  readonly isTrusted: boolean | null
  /**
   * The connection meta
   */
  readonly connectionMeta: ConnectionMeta
  /**
   * Return a promise that resolves when the client is trusted
   *
   * Rejects with an error if the timeout is reached
   *
   * @param timeout - The timeout in milliseconds, default to 60 seconds
   */
  ensureTrusted: (timeout?: number) => Promise<boolean>

  /**
   * Request trust from the server
   */
  requestTrust: () => Promise<boolean>

  /**
   * Request trust from the server using a previously-issued auth token.
   * Updates the stored token and re-requests trust without reloading the page.
   */
  requestTrustWithToken: (token: string) => Promise<boolean>

  /**
   * Authenticate this client by exchanging a one-time code (shown by the dev
   * server) for a node-issued auth token. On success the token is persisted for
   * future reconnections and shared with sibling tabs. Resolves `true` when
   * authenticated.
   */
  requestTrustWithCode: (code: string) => Promise<boolean>

  /**
   * Call a RPC function on the server
   */
  call: DevframeRpcClientCall
  /**
   * Call a RPC event on the server, and does not expect a response
   */
  callEvent: DevframeRpcClientCallEvent
  /**
   * Call a RPC optional function on the server
   */
  callOptional: DevframeRpcClientCallOptional
  /**
   * The client RPC host
   */
  client: DevframeClientRpcHost

  /**
   * The shared state host
   */
  sharedState: RpcSharedStateHost
  /**
   * The streaming channel host. Subscribe to a server-side stream by
   * channel + id; the returned reader is both `AsyncIterable<T>` and
   * exposes `.readable: ReadableStream<T>` for `pipeTo` consumption.
   */
  streaming: RpcStreamingClientHost
  /**
   * The RPC cache manager
   */
  cacheManager: RpcCacheManager

  /**
   * Create a namespace-scoped view of this client. The returned
   * `client.scope('my-plugin')` auto-namespaces every RPC id,
   * shared-state key, and streaming channel with `my-plugin:`, and
   * exposes a typed top-level `settings` store. This is the preferred way
   * to consume the client from a single tool's UI code.
   *
   * Pass `null` or `''` to un-scope and get the base client.
   */
  scope: {
    <NS extends string>(namespace: NS): DevframeScopedClientContext<NS, SettingsForNamespace<NS>>
    (namespace?: null | ''): DevframeRpcClient
  }
}

export interface DevframeRpcClientMode {
  readonly isTrusted: boolean
  ensureTrusted: DevframeRpcClient['ensureTrusted']
  requestTrust: DevframeRpcClient['requestTrust']
  requestTrustWithToken: DevframeRpcClient['requestTrustWithToken']
  /**
   * Exchange a one-time code for a node-issued token. Resolves the minted
   * token on success (for the caller to persist), or `null` on failure.
   */
  requestTrustWithCode: (code: string) => Promise<string | null>
  call: DevframeRpcClient['call']
  callEvent: DevframeRpcClient['callEvent']
  callOptional: DevframeRpcClient['callOptional']
}

function getStoredAuthToken(userAuthToken?: string): string | undefined {
  const getters = [
    () => userAuthToken,
    () => localStorage.getItem(CONNECTION_AUTH_TOKEN_KEY) ?? undefined,
    () => (window as any)?.[CONNECTION_AUTH_TOKEN_KEY],
    () => (globalThis as any)?.[CONNECTION_AUTH_TOKEN_KEY],
    () => (parent.window as any)?.[CONNECTION_AUTH_TOKEN_KEY],
  ]

  for (const getter of getters) {
    try {
      const value = getter()
      if (value)
        return value
    }
    catch {}
  }

  // No token yet — the client is unauthenticated and must exchange a one-time
  // code (see `requestTrustWithCode`) to obtain a node-issued token.
  return undefined
}

function persistAuthToken(token: string): void {
  try {
    localStorage.setItem(CONNECTION_AUTH_TOKEN_KEY, token)
  }
  catch {}
  ;(globalThis as any)[CONNECTION_AUTH_TOKEN_KEY] = token
}

function findConnectionMetaFromWindows(): ConnectionMeta | undefined {
  const getters = [
    () => (window as any)?.[CONNECTION_META_KEY],
    () => (globalThis as any)?.[CONNECTION_META_KEY],
    () => (parent.window as any)?.[CONNECTION_META_KEY],
  ]

  for (const getter of getters) {
    try {
      const value = getter()
      if (value)
        return value
    }
    catch {}
  }
}

export async function getDevframeRpcClient(
  options: DevframeRpcClientOptions = {},
): Promise<DevframeRpcClient> {
  // Default to a relative base — the SPA owns its mount path at runtime,
  // so the connection meta and dump shards live alongside `index.html`.
  // Embedded surfaces that run inside a host page (e.g. a webcomponent
  // injected by a host) must pass an explicit `baseURL` because their
  // `document.baseURI` points at the host app, not the devtool's mount.
  const {
    baseURL = './',
    rpcOptions = {},
    cacheOptions = false,
  } = options
  const events = createEventEmitter<RpcClientEvents>()
  const bases = Array.isArray(baseURL) ? baseURL : [baseURL]
  let connectionMeta: ConnectionMeta | undefined = options.connectionMeta || findConnectionMetaFromWindows()
  let resolvedBaseURL = bases[0] ?? './'

  // Absolute URL of where `__connection.json` lives, used to resolve a
  // relative WS path against the SPA's own origin (proxy-safe). Falls back to
  // the page location when running outside a browser document.
  function resolveMetaBaseUrl(): string {
    const metaPath = withBase(DEVFRAME_CONNECTION_META_FILENAME, resolvedBaseURL)
    try {
      return new URL(metaPath, globalThis.location?.href).href
    }
    catch {
      return metaPath
    }
  }

  if (!connectionMeta) {
    const errors: Error[] = []
    for (const base of bases) {
      try {
        connectionMeta = await fetch(withBase(DEVFRAME_CONNECTION_META_FILENAME, base))
          .then(r => r.json()) as ConnectionMeta
        resolvedBaseURL = base
        ;(globalThis as any)[CONNECTION_META_KEY] = connectionMeta
        break
      }
      catch (e) {
        errors.push(e as Error)
      }
    }
    if (!connectionMeta) {
      throw new Error(`Failed to get connection meta from ${bases.join(', ')}`, {
        cause: errors,
      })
    }
  }

  const cacheManager = new RpcCacheManager({ functions: [], ...(typeof options.cacheOptions === 'object' ? options.cacheOptions : {}) })
  const context: DevframeRpcContext = {
    rpc: undefined!,
  }
  const authToken = getStoredAuthToken(options.authToken)
  // Persist a resolved token so one supplied out-of-band — e.g. a host that
  // bootstraps trust by passing `authToken` (read from its own page URL query)
  // — survives reconnects. The token is still sent to the server via the WS
  // URL query param (`?devframe_auth_token=`) by the transport.
  if (authToken)
    persistAuthToken(authToken)
  const clientRpc: DevframeClientRpcHost = new RpcFunctionsCollectorBase<DevframeRpcClientFunctions, DevframeRpcContext>(context)

  async function fetchJsonFromBases(path: string): Promise<any> {
    const candidates = [
      resolvedBaseURL,
      ...bases.filter(base => base !== resolvedBaseURL),
    ].filter(x => x != null)

    const errors: Error[] = []
    for (const base of candidates) {
      try {
        return await fetch(withBase(path, base)).then((r) => {
          if (!r.ok) {
            throw new Error(`Failed to fetch ${path} from ${base}: ${r.status}`)
          }
          return r.json()
        })
      }
      catch (error) {
        errors.push(error as Error)
      }
    }

    throw new Error(`Failed to load ${path} from ${candidates.join(', ')}`, {
      cause: errors,
    })
  }

  const mode = connectionMeta.backend === 'static'
    ? await createStaticRpcClientMode({
        fetchJsonFromBases,
      })
    : createWsRpcClientMode({
        authToken,
        connectionMeta,
        metaBaseUrl: resolveMetaBaseUrl(),
        events,
        clientRpc,
        rpcOptions: {
          ...rpcOptions,
          async onRequest(req, next, resolve) {
            await rpcOptions.onRequest?.call(this, req, next, resolve)
            if (cacheOptions && cacheManager?.validate(req.m)) {
              if (cacheManager.has(req.m, req.a)) {
                return resolve(cacheManager.cached(req.m, req.a))
              }
              const res = await next(req)
              cacheManager.apply(req, res)
            }
            else {
              await next(req)
            }
          },
        },
        wsOptions: options.wsOptions,
      })

  // Channel name kept for cross-tab interop with the Vite DevTools auth page.
  let authChannel: BroadcastChannel | undefined
  try {
    authChannel = new BroadcastChannel('devframe-auth')
  }
  catch {}

  const rpc: DevframeRpcClient = {
    events,
    get isTrusted() {
      return mode.isTrusted
    },
    connectionMeta,
    ensureTrusted: mode.ensureTrusted,
    requestTrust: mode.requestTrust,
    requestTrustWithToken: async (token: string) => {
      // Update stored token for future reconnections
      persistAuthToken(token)
      return mode.requestTrustWithToken(token)
    },
    requestTrustWithCode: async (code: string) => {
      const token = await mode.requestTrustWithCode(code)
      if (!token)
        return false
      // Persist the node-issued token and share it with sibling tabs so they
      // become trusted without re-entering the code.
      persistAuthToken(token)
      try {
        authChannel?.postMessage({ type: 'auth-update', authToken: token })
      }
      catch {}
      return true
    },
    call: mode.call,
    callEvent: mode.callEvent,
    callOptional: mode.callOptional,
    client: clientRpc,
    sharedState: undefined!,
    streaming: undefined!,
    cacheManager,
    scope: undefined!,
  }

  rpc.sharedState = createRpcSharedStateClientHost(rpc)
  rpc.streaming = createRpcStreamingClientHost(rpc)

  // Namespace-scoped views are memoized per namespace so repeated
  // `client.scope('my-plugin')` calls return a stable object.
  const scopedCache = new Map<string, DevframeScopedClientContext<string>>()
  rpc.scope = ((namespace?: string | null) => {
    if (!namespace)
      return rpc
    let scoped = scopedCache.get(namespace)
    if (!scoped) {
      scoped = createScopedClientContext(rpc, namespace)
      scopedCache.set(namespace, scoped)
    }
    return scoped
  }) as DevframeRpcClient['scope']

  // @ts-expect-error assign to readonly property
  context.rpc = rpc
  void mode.requestTrust()

  // Magic-link authentication: if the page URL carries a one-time code, exchange
  // it and strip it from the URL. The code is single-use and short-lived; the
  // resulting bearer token is persisted (never written back to the URL).
  // Integrations that drive their own auth UI opt out with `otpParam: false`
  // and call `authenticateWithUrlOtp` / `consumeOtpFromUrl` directly.
  const otpParam = options.otpParam ?? DEVFRAME_OTP_URL_PARAM
  if (otpParam)
    void authenticateWithUrlOtp(rpc, { param: otpParam })

  // Listen for auth updates from other tabs (e.g., the auth page, or another
  // tab that just completed a code exchange).
  if (authChannel) {
    authChannel.onmessage = (event) => {
      if (event.data?.type === 'auth-update' && event.data.authToken) {
        rpc.requestTrustWithToken(event.data.authToken)
      }
    }
  }

  return rpc
}
