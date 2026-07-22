import type { BirpcOptions, BirpcReturn } from 'birpc'
import type { RpcCacheOptions, RpcFunctionsCollector } from 'devframe/rpc'
import type { WsRpcChannelOptions } from 'devframe/rpc/transports/ws-client'
import type { ConnectionMeta, DevframeRpcClientFunctions, DevframeRpcServerFunctions, EventEmitter, RpcSharedStateHost, SettingsForNamespace } from 'devframe/types'
import type { DevframeConnectionStatus } from './connection'
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
  /**
   * The connection status changed. Carries the new status and the previous one
   * so a UI can react to specific transitions (e.g. `connected` → `disconnected`).
   */
  'connection:status': (status: DevframeConnectionStatus, previous: DevframeConnectionStatus) => void
  /**
   * A connection-level error occurred (the WebSocket errored, or trust was
   * refused). The status typically moves to `error`/`unauthorized` alongside it.
   */
  'connection:error': (error: Error) => void
  /**
   * An RPC call rejected — either from the server, or because the connection
   * was down / timed out. Useful for a global error feed or toast surface.
   */
  'rpc:error': (error: Error, method: string) => void
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
   * own authentication via `authenticateWithUrlOtp`.
   *
   * @default 'devframe_otp'
   */
  otpParam?: string | false
  /**
   * Fall back to a native browser `prompt()` for the one-time authentication
   * code when the server refuses trust and no other credential succeeds (a
   * stored token, an injected token, or a magic-link OTP). The prompt fires
   * only on a **top-level, unframed** page — a framed plugin (e.g. mounted in
   * a hub dock) never prompts, since a hub pre-authorizes it and browsers
   * block `prompt()` in cross-origin frames anyway.
   *
   * Set `false` to drive your own auth UI (a hub sets this on the plugin
   * connections it manages, alongside supplying the token).
   *
   * @default true
   */
  simpleAuth?: boolean
  wsOptions?: Partial<WsRpcChannelOptions>
  rpcOptions?: Partial<BirpcOptions<DevframeRpcServerFunctions, DevframeRpcClientFunctions, boolean>>
  cacheOptions?: boolean | Partial<RpcCacheOptions>
  /**
   * Reject a pending `rpc.call(...)` if the server hasn't answered within this
   * many milliseconds, with a {@link DevframeConnectionError} of kind
   * `'timeout'`. Guards against a live-but-unresponsive server hanging the UI.
   * Omit (or `0`) to wait indefinitely. Calls always fail fast — regardless of
   * this option — once the socket closes or trust is refused.
   */
  callTimeout?: number
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
   * The current connection status. Drives connection/auth/error UI without the
   * consumer having to track the transport and trust handshake separately.
   * Subscribe to `events.on('connection:status', …)` to react to changes.
   */
  readonly status: DevframeConnectionStatus
  /**
   * The most recent connection-level error (WebSocket error, refused trust, or
   * failed connection-meta load), or `null` when the connection is healthy.
   */
  readonly connectionError: Error | null
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
  readonly status: DevframeConnectionStatus
  readonly connectionError: Error | null
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
  // When the meta is inherited from a same-origin parent, it carries the base
  // it was resolved against (`baseUrl`); reuse it so a relative `websocket.path`
  // resolves against the publisher's mount rather than this SPA's own
  // (possibly different) base.
  const inheritedMetaBaseUrl = options.connectionMeta ? undefined : connectionMeta?.baseUrl

  // Absolute URL of where `__connection.json` lives, used to resolve a
  // relative WS path against the SPA's own origin (proxy-safe). Falls back to
  // the page location when running outside a browser document.
  function resolveMetaBaseUrl(): string {
    if (inheritedMetaBaseUrl)
      return inheritedMetaBaseUrl
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
        // Publish the meta annotated with the absolute base it was resolved
        // against (`baseUrl`), so a same-origin child mounted at another base
        // inherits a dialable endpoint instead of resolving the relative WS
        // path against its own mount.
        ;(globalThis as any)[CONNECTION_META_KEY] = {
          ...connectionMeta,
          baseUrl: resolveMetaBaseUrl(),
        } satisfies ConnectionMeta
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
  // An explicit option wins, then a token baked into the (hub-served) meta —
  // the cross-origin channel a framed plugin relies on since it can't read the
  // hub's `localStorage` — then this origin's own stored token.
  const authToken = getStoredAuthToken(options.authToken || connectionMeta.authToken)
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
        callTimeout: options.callTimeout,
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

  // Gate outbound calls behind the auth bootstrap kicked off below (stored
  // auth token, then the URL's magic-link OTP, then — standalone/top-level
  // only — a native prompt). Without this, a caller's very first RPC calls
  // (fired the moment `connectDevframe()` resolves — e.g. a component's
  // `onMount`) race that still-in-flight sequence: the socket is open, so
  // the transport happily sends them, and the server rejects them with
  // DF0036 because trust hasn't landed yet — even though the exact same call
  // would succeed a moment later. `bootstrapAuthPromise` is assigned once
  // `bootstrapAuth()` is kicked off further down; these closures read the
  // variable at call time, so the gate is live even though it's declared
  // before that assignment happens. Once the first bootstrap attempt has
  // settled (trusted, refused, or given up), `bootstrapAuthSettled` flips
  // for good and every later call skips the gate entirely — this only ever
  // holds the first wave of calls.
  let bootstrapAuthPromise: Promise<void> | undefined
  let bootstrapAuthSettled = false
  function gateOnBootstrapAuth<F extends (...args: any[]) => any>(fn: F): F {
    return ((...args: any[]) => {
      if (bootstrapAuthSettled || !bootstrapAuthPromise)
        return fn(...args)
      return bootstrapAuthPromise.then(() => fn(...args))
    }) as F
  }

  const rpc: DevframeRpcClient = {
    events,
    get isTrusted() {
      return mode.isTrusted
    },
    get status() {
      return mode.status
    },
    get connectionError() {
      return mode.connectionError
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
    call: gateOnBootstrapAuth(mode.call),
    callEvent: gateOnBootstrapAuth(mode.callEvent),
    callOptional: gateOnBootstrapAuth(mode.callOptional),
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

  // Whether this document is the top-level, unframed page. Only there can a
  // native `prompt()` actually be shown — a framed plugin (hub dock) instead
  // waits for a hub-injected/broadcast token to arrive. Accessing
  // `window.top` cross-origin throws, which itself means we're framed.
  function isTopLevelUnframed(): boolean {
    try {
      return typeof window !== 'undefined' && window.self === window.top
    }
    catch {
      return false
    }
  }

  // Last-resort standalone fallback: ask for the one-time code via the
  // browser's native `prompt()` (zero UI, so devframe stays headless) and
  // re-prompt on a wrong/expired code until the exchange succeeds or the user
  // cancels. Cancelling leaves the connection `unauthorized` without nagging.
  async function runSimpleAuthPrompt(): Promise<void> {
    if (options.simpleAuth === false || !isTopLevelUnframed())
      return
    if (typeof globalThis.prompt !== 'function')
      return
    while (!rpc.isTrusted) {
      // eslint-disable-next-line no-alert -- native prompt() is intentional: zero UI keeps devframe headless.
      const code = globalThis.prompt('devframe: enter the authentication code shown in your terminal')
      // Cancel → stop; leave status `unauthorized`.
      if (code == null)
        return
      const trimmed = code.trim()
      if (!trimmed)
        continue
      if (await rpc.requestTrustWithCode(trimmed))
        return
    }
  }

  // Drive trust in order: the connect-time handshake (stored/injected token)
  // first, then the magic-link OTP (silent — a one-time code on the page URL,
  // single-use and short-lived, stripped from the URL and never re-persisted),
  // then the native-prompt fallback. Integrations that drive their own auth UI
  // opt out of the URL read with `otpParam: false` and of the prompt with
  // `simpleAuth: false`.
  async function bootstrapAuth(): Promise<void> {
    const trusted = await mode.requestTrust()
    const otpParam = options.otpParam ?? DEVFRAME_OTP_URL_PARAM
    // Always consume the URL OTP (so it's stripped) even once trusted; it only
    // exchanges when a code is present and we're not yet trusted.
    const viaOtp = otpParam ? await authenticateWithUrlOtp(rpc, { param: otpParam }) : false
    if (trusted || viaOtp || rpc.isTrusted)
      return
    await runSimpleAuthPrompt()
  }
  // Always resolves (never rejects) regardless of `bootstrapAuth`'s outcome —
  // the gate only cares that the first attempt is *over*, not whether it
  // succeeded; a rejection here must never leak into unrelated calls waiting
  // on `bootstrapAuthPromise`.
  bootstrapAuthPromise = bootstrapAuth().then(
    () => { bootstrapAuthSettled = true },
    () => { bootstrapAuthSettled = true },
  )

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
