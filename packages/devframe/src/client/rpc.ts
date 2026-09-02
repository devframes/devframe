import type { BirpcOptions, BirpcReturn } from 'birpc'
import type { RpcCacheOptions, RpcFunctionsCollector } from 'devframe/rpc'
import type { SseRpcChannelOptions } from 'devframe/rpc/transports/sse-client'
import type { WsRpcChannelOptions } from 'devframe/rpc/transports/ws-client'
import type { ConnectionMeta, DevframeRpcClientFunctions, DevframeRpcServerFunctions, EventEmitter, RpcSharedStateHost, SettingsForNamespace } from 'devframe/types'
import type { DevframeConnection, DevframeConnectionStatus, SetupDevframeConnectionOptions } from './connection'
import type { DevframeServicesClient } from './rpc-services'
import type { RpcStreamingClientHost } from './rpc-streaming'
import type { DevframeScopedClientContext } from './scope'
import { DEVFRAME_OTP_URL_PARAM } from 'devframe/constants'
import { RpcCacheManager, RpcFunctionsCollectorBase } from 'devframe/rpc'
import { createEventEmitter } from 'devframe/utils/events'
import { withBase } from 'ufo'
import { setupDevframeConnection } from './connection'
import { storeAuthToken } from './connection-storage'
import { authenticateWithUrlOtp } from './otp'
import { createDevframeServicesClient } from './rpc-services'
import { createRpcSharedStateClientHost } from './rpc-shared-state'
import { createSseRpcClientMode } from './rpc-sse'
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
   * An RPC call rejected, either from the server, or because the connection
   * was down / timed out. Useful for a global error feed or toast surface.
   */
  'rpc:error': (error: Error, method: string) => void
}

export interface DevframeRpcClientOptions extends SetupDevframeConnectionOptions {
  /**
   * The auth token to use for the client
   */
  authToken?: string
  /**
   * Query-param name on the page URL carrying a one-time authentication code
   * (OTP) for "magic link" auth (e.g. a link the dev server prints). When
   * present, the client exchanges the code for a token and removes the parameter
   * from the URL. Set `false` to disable, e.g. integrations that drive their
   * own authentication via `authenticateWithUrlOtp`.
   *
   * @default 'devframe_otp'
   */
  otpParam?: string | false
  /**
   * Fall back to a native browser `prompt()` for the one-time authentication
   * code when the server refuses trust and no other credential succeeds (a
   * stored token, an injected token, or a magic-link OTP). The prompt fires
   * only on a **top-level, unframed** page; a framed plugin (e.g. mounted in
   * a hub dock) never prompts, since a hub pre-authorizes it and browsers
   * block `prompt()` in cross-origin frames anyway.
   *
   * Set `false` to drive your own auth UI (a hub sets this on the plugin
   * connections it manages, alongside supplying the token).
   *
   * @default true
   */
  simpleAuth?: boolean
  /**
   * Which live transport to connect over:
   *
   *  - `'auto'` (default) trusts the server's advertisement: its declared
   *    primary (`backend`), preferring the WebSocket when both endpoints are
   *    present. A server that couldn't bind a socket advertises SSE as its
   *    primary, so no client-side fallback probing is needed.
   *  - `'websocket'` / `'sse'` pins one transport; connecting fails with a
   *    clear error when the server doesn't advertise it. Reach for
   *    `transport: 'sse'` when an intermediary silently strips WS upgrades,
   *    something the server cannot detect.
   *
   * A `static` backend ignores this option (there is no live transport).
   */
  transport?: 'auto' | 'websocket' | 'sse'
  wsOptions?: Partial<WsRpcChannelOptions>
  /** Channel overrides for the SSE transport, the `wsOptions` counterpart. */
  sseOptions?: Partial<SseRpcChannelOptions>
  rpcOptions?: Partial<BirpcOptions<DevframeRpcServerFunctions, DevframeRpcClientFunctions, boolean>>
  cacheOptions?: boolean | Partial<RpcCacheOptions>
  /**
   * Reject a pending `rpc.call(...)` if the server hasn't answered within this
   * many milliseconds, with a {@link DevframeConnectionError} of kind
   * `'timeout'`. Guards against a live-but-unresponsive server hanging the UI.
   * Omit (or `0`) to wait indefinitely. Calls always fail fast, regardless of
   * this option, once the socket closes or trust is refused.
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
   * The most recent connection-level error (transport error, refused trust,
   * or failed connection-meta load), or `null` when the connection is healthy.
   */
  readonly connectionError: Error | null
  /**
   * The transport this client is actually connected over: `'websocket'`,
   * `'sse'`, or `'static'`. Reflects the resolution of the `transport`
   * option against the server's advertisement.
   */
  readonly transport: 'websocket' | 'sse' | 'static'
  /**
   * The complete connection used by this client, including the metadata source
   * URL external viewers use to resolve relative resources.
   */
  readonly connection: DevframeConnection
  /**
   * The server-advertised connection metadata.
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
   * The server's advertised wire services (mirrored `devframe:services`
   * shared state); feature-detect a capability with
   * `rpc.services.has('@devframes/service-x')` and get a scoped, typed RPC
   * handle with `rpc.services.get(...)`. See {@link DevframeServicesClient}.
   */
  services: DevframeServicesClient
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

  /**
   * Close the connection. A `static` backend is a no-op (there is no live socket to close);
   * a `websocket` backend closes the underlying `WebSocket`, which the server observes as a
   * normal disconnect. Mirrors {@link WsRpcTransport.close} on the server side.
   *
   * There is no corresponding "reconnect"; a closed client is done. Discard it and call
   * {@link getDevframeRpcClient} again to reconnect.
   *
   * Optional so a `DevframeRpcClientMode` implemented before this method existed (a custom
   * transport, a hand-typed mock) still satisfies the interface; an absent `close` is treated
   * as nothing to close.
   */
  close?: () => void
}

export interface DevframeRpcClientMode {
  /**
   * The transport this mode speaks. Optional so a mode implemented before
   * this field existed (a custom transport, a hand-typed mock) still
   * satisfies the interface; an absent value reads as `'websocket'`.
   */
  readonly transport?: 'websocket' | 'sse' | 'static'
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
  /** See {@link DevframeRpcClient.close}. */
  close?: () => void
}

/**
 * Resolve the requested `transport` option against what the server
 * advertises. `'auto'` trusts the advertisement: the server's declared
 * primary (`backend`), preferring the WebSocket when both endpoints are
 * present; an explicit `'websocket'` / `'sse'` pins that transport and
 * throws when the server doesn't advertise it.
 */
export function resolveClientTransport(
  requested: 'auto' | 'websocket' | 'sse',
  meta: ConnectionMeta,
): 'websocket' | 'sse' | 'static' {
  if (meta.backend === 'static')
    return 'static'
  const hasWebsocket = meta.websocket !== undefined
  const hasSse = meta.sse !== undefined
  if (requested === 'websocket') {
    if (!hasWebsocket)
      throw new Error('[devframe] transport: \'websocket\' was requested, but this server does not advertise a WebSocket endpoint')
    return 'websocket'
  }
  if (requested === 'sse') {
    if (!hasSse)
      throw new Error('[devframe] transport: \'sse\' was requested, but this server does not advertise an SSE endpoint')
    return 'sse'
  }
  // 'auto': the server's declared primary first, then whatever is present.
  if (meta.backend === 'sse' && hasSse)
    return 'sse'
  if (hasWebsocket)
    return 'websocket'
  if (hasSse)
    return 'sse'
  throw new Error('[devframe] This server advertises no RPC transport (backend "none"), so there is nothing to connect to. Enable the WebSocket or SSE endpoint on the server, or use its static/MCP surfaces instead.')
}

export async function getDevframeRpcClient(
  options: DevframeRpcClientOptions = {},
): Promise<DevframeRpcClient> {
  // Default to a relative base: the SPA owns its mount path at runtime, so
  // connection meta and dump shards live alongside `index.html`. An embedded
  // surface inside a host page must pass an explicit `baseURL` - its
  // `document.baseURI` points at the host app, not the devtool's mount.
  const {
    baseURL = './',
    rpcOptions = {},
    cacheOptions = false,
  } = options
  const events = createEventEmitter<RpcClientEvents>()
  const bases = Array.isArray(baseURL) ? baseURL : [baseURL]
  let connection = await setupDevframeConnection(options)
  const { connectionMeta, metaBaseUrl, authToken } = connection
  let resolvedBaseURL = bases[0] ?? './'
  try {
    resolvedBaseURL = new URL('.', metaBaseUrl).href
  }
  catch {}

  const cacheManager = new RpcCacheManager({ functions: [], ...(typeof options.cacheOptions === 'object' ? options.cacheOptions : {}) })
  const context: DevframeRpcContext = {
    rpc: undefined!,
  }
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

  const liveModeOptions = {
    authToken,
    connectionMeta,
    metaBaseUrl,
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
    } satisfies DevframeRpcClientOptions['rpcOptions'],
  }

  const transport = resolveClientTransport(options.transport ?? 'auto', connectionMeta)
  const mode = transport === 'static'
    ? await createStaticRpcClientMode({
        fetchJsonFromBases,
      })
    : transport === 'sse'
      ? createSseRpcClientMode({
          ...liveModeOptions,
          sseOptions: options.sseOptions,
        })
      : createWsRpcClientMode({
          ...liveModeOptions,
          wsOptions: options.wsOptions,
        })

  // Channel name kept for cross-tab interop with the Vite DevTools auth page.
  let authChannel: BroadcastChannel | undefined
  try {
    authChannel = new BroadcastChannel('devframe-auth')
  }
  catch {}

  // Gate outbound calls behind the auth bootstrap below. Without it, a
  // caller's first RPC calls, fired the moment `connectDevframe()` resolves,
  // race the in-flight handshake over the open socket and get rejected with
  // DF0036. The closures read `bootstrapAuthPromise` at call time, so the gate
  // works though declared before it's assigned.
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
    get transport() {
      return mode.transport ?? transport
    },
    get connection() {
      return connection
    },
    connectionMeta,
    ensureTrusted: mode.ensureTrusted,
    requestTrust: mode.requestTrust,
    requestTrustWithToken: async (token: string) => {
      // Update stored token for future reconnections
      storeAuthToken(token)
      connection = { ...connection, authToken: token }
      return mode.requestTrustWithToken(token)
    },
    requestTrustWithCode: async (code: string) => {
      const token = await mode.requestTrustWithCode(code)
      if (!token)
        return false
      // Persist the node-issued token and share it with sibling tabs so they
      // become trusted without re-entering the code.
      storeAuthToken(token)
      connection = { ...connection, authToken: token }
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
    services: undefined!,
    streaming: undefined!,
    cacheManager,
    scope: undefined!,
    close: () => mode.close?.(),
  }

  rpc.sharedState = createRpcSharedStateClientHost(rpc)
  rpc.streaming = createRpcStreamingClientHost(rpc)
  rpc.services = createDevframeServicesClient(rpc)

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
  // native `prompt()` actually be shown; a framed plugin (hub dock) instead
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

  // Drive trust in order: the connect-time handshake (stored token), then the
  // silent magic-link URL OTP, then the native-prompt fallback. Integrations
  // with their own auth UI opt out of the URL read with `otpParam: false` and
  // the prompt with `simpleAuth: false`.
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
  // Always resolves (never rejects) regardless of `bootstrapAuth`'s outcome;
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
