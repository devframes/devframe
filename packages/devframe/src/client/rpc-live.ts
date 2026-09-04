import type { ChannelOptions } from 'birpc'
import type { ConnectionMeta, DevframeRpcClientFunctions, DevframeRpcServerFunctions, EventEmitter } from 'devframe/types'
import type { DevframeConnectionStatus } from './connection'
import type { DevframeClientRpcHost, DevframeRpcClientMode, DevframeRpcClientOptions, RpcClientEvents } from './rpc'
import { createRpcClient } from 'devframe/rpc/client'
import { DEVFRAME_EVENTS } from '../events'
import { DevframeConnectionError } from './connection'

/** What a live transport's channel factory receives from the shared mode. */
interface LiveRpcChannelHandlers {
  /**
   * Per-method `jsonSerializable` flags rebuilt from the connection meta,
   * for the channel's wire codec.
   */
  definitions: Map<string, { jsonSerializable: true }>
  onError: (error: Error) => void
  onDisconnected: () => void
}

export interface CreateLiveRpcClientModeOptions {
  /** Which transport the channel factory produces. */
  transport: 'websocket' | 'sse'
  /** Build the transport channel, wiring the mode's status handlers in. */
  createChannel: (handlers: LiveRpcChannelHandlers) => ChannelOptions & { close: () => void }
  authToken?: string
  connectionMeta: ConnectionMeta
  events: EventEmitter<RpcClientEvents>
  clientRpc: DevframeClientRpcHost
  rpcOptions?: DevframeRpcClientOptions['rpcOptions']
  /** See {@link DevframeRpcClientOptions.callTimeout}. */
  callTimeout?: number
}

/**
 * The transport-independent half of a live RPC client mode (connection
 * status, pending-call guarding, and the trust handshake), shared by the
 * WebSocket and SSE modes. Each transport supplies only its channel.
 */
export function createLiveRpcClientMode(
  options: CreateLiveRpcClientModeOptions,
): DevframeRpcClientMode {
  const {
    transport,
    authToken,
    connectionMeta,
    events,
    clientRpc,
    rpcOptions = {},
    callTimeout = 0,
  } = options

  let isTrusted = false
  let status: DevframeConnectionStatus = 'connecting'
  let connectionError: Error | null = null
  const trustedPromise = Promise.withResolvers<boolean>()

  // ── connection status ────────────────────────────────────────────────────

  function setStatus(next: DevframeConnectionStatus, error: Error | null = null): void {
    if (error)
      connectionError = error
    else if (next === 'connected')
      connectionError = null
    if (next === status)
      return
    const previous = status
    status = next
    events.emit(DEVFRAME_EVENTS.client.connectionStatus, next, previous)
  }

  // Pending calls we can settle proactively; a connection that drops (or a
  // server that never trusts us) would otherwise leave these promises hanging
  // forever, which is exactly the "spinner that never resolves" this guards
  // against.
  const pending = new Set<{ reject: (error: Error) => void }>()

  function rejectAllPending(error: Error): void {
    for (const entry of [...pending]) entry.reject(error)
  }

  function terminalError(): DevframeConnectionError | null {
    if (status === 'disconnected' || status === 'error')
      return new DevframeConnectionError('connection', '[devframe] Not connected to the devframe server', { cause: connectionError ?? undefined })
    if (status === 'unauthorized')
      return new DevframeConnectionError('auth', '[devframe] Not authorized by the devframe server', { cause: connectionError ?? undefined })
    return null
  }

  /**
   * Wrap an in-flight call promise so it settles on server response, on an
   * optional wall-clock timeout, or when the connection drops, so it never hangs.
   */
  function guardCall<T>(promise: Promise<T>, method: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const entry = {
        reject(error: Error) {
          if (settled)
            return
          finish()
          events.emit(DEVFRAME_EVENTS.client.error, error, method)
          reject(error)
        },
      }
      function finish(): void {
        settled = true
        pending.delete(entry)
        if (timer)
          clearTimeout(timer)
      }
      pending.add(entry)
      if (callTimeout > 0) {
        timer = setTimeout(() => {
          entry.reject(new DevframeConnectionError('timeout', `[devframe] RPC call "${method}" timed out after ${callTimeout}ms`))
        }, callTimeout)
      }
      promise.then(
        (value) => {
          if (settled)
            return
          finish()
          resolve(value)
        },
        (error: unknown) => {
          if (settled)
            return
          finish()
          const err = error instanceof Error ? error : new Error(String(error))
          events.emit(DEVFRAME_EVENTS.client.error, err, method)
          reject(err)
        },
      )
    })
  }

  // Build a minimal `defs` map from the connection meta so the per-call
  // wire serializer dispatches outgoing requests with the correct
  // encoding (JSON for `jsonSerializable: true` methods; structured-
  // clone for the rest).
  const definitions = new Map<string, { jsonSerializable: true }>()
  for (const name of connectionMeta.jsonSerializableMethods ?? [])
    definitions.set(name, { jsonSerializable: true })

  // Hoisted out of the `createRpcClient` call so `close()` below can reach it; birpc's own
  // `ChannelOptions` carries no reference back to what it was built from.
  const channel = options.createChannel({
    definitions,
    onError(error) {
      setStatus('error', error)
      events.emit(DEVFRAME_EVENTS.client.connectionError, error)
      rejectAllPending(new DevframeConnectionError('connection', '[devframe] Connection to the devframe server failed', { cause: error }))
    },
    onDisconnected() {
      // A clean close after we were connected, or a connection that never
      // opened; either way calls can no longer be served.
      if (status !== 'error')
        setStatus('disconnected')
      rejectAllPending(new DevframeConnectionError('connection', '[devframe] Disconnected from the devframe server', { cause: connectionError ?? undefined }))
    },
  })
  const serverRpc = createRpcClient<DevframeRpcServerFunctions, DevframeRpcClientFunctions>(
    clientRpc.functions,
    {
      channel,
      rpcOptions,
    },
  )

  // Handle server-initiated auth revocation
  clientRpc.register({
    name: DEVFRAME_EVENTS.broadcast.authRevoked,
    type: 'event',
    handler: () => {
      isTrusted = false
      const authError = new DevframeConnectionError('auth', '[devframe] The devframe server revoked this client\'s trust')
      setStatus('unauthorized', authError)
      events.emit(DEVFRAME_EVENTS.client.connectionError, authError)
      rejectAllPending(authError)
      events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, false)
    },
  })

  let currentAuthToken: string | undefined = authToken

  async function requestTrustWithToken(token: string) {
    currentAuthToken = token

    const result = await serverRpc.$call('anonymous:devframe:auth', {
      authToken: token,
      /**
       * Sent raw; the server parses it into a display label (see
       * `describeUA` in `node/auth/state.ts`) so `ua-parser-modern` stays
       * out of the browser bundle.
       */
      ua: navigator.userAgent,
      origin: location.origin,
    })

    isTrusted = result.isTrusted
    // Only settle the trust gate on success; on failure the client can still
    // authenticate via `requestTrustWithCode`, so leave `ensureTrusted` waiting.
    if (isTrusted) {
      trustedPromise.resolve(true)
      setStatus('connected')
    }
    else {
      // The server refused this token. On an auth-enforcing host, untrusted
      // calls won't be served; surface it so the UI can prompt for auth
      // rather than spin. The standalone (`auth: false`) server auto-trusts,
      // so it never lands here.
      const authError = new DevframeConnectionError('auth', '[devframe] The devframe server refused this client\'s credentials')
      setStatus('unauthorized', authError)
      events.emit(DEVFRAME_EVENTS.client.connectionError, authError)
    }
    events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, isTrusted)
    return result.isTrusted
  }

  async function requestTrustWithCode(code: string): Promise<string | null> {
    const result = await serverRpc.$call('anonymous:devframe:auth:exchange', {
      code,
      ua: navigator.userAgent,
      origin: location.origin,
    })

    const token = result?.authToken ?? null
    if (token) {
      currentAuthToken = token
      isTrusted = true
      trustedPromise.resolve(true)
      setStatus('connected')
      events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, true)
    }
    return token
  }

  async function requestTrust() {
    if (isTrusted)
      return true
    // Always announce on connect. The standalone (`auth: false`) noop handler
    // auto-trusts regardless of token; the host adapter looks the token up and
    // returns `false` for an unauthenticated client (empty/unknown token), which
    // then authenticates via `requestTrustWithCode`. The trust gate stays open
    // until then.
    return requestTrustWithToken(currentAuthToken ?? '')
  }

  async function ensureTrusted(timeout = 60_000): Promise<boolean> {
    if (isTrusted)
      trustedPromise.resolve(true)

    if (timeout <= 0)
      return trustedPromise.promise

    let clear = () => {}
    await Promise.race([
      trustedPromise.promise.then(clear),
      new Promise((resolve, reject) => {
        const id = setTimeout(() => {
          reject(new Error('[devframe] Timeout waiting for rpc to be trusted'))
        }, timeout)
        clear = () => clearTimeout(id)
      }),
    ])

    return isTrusted
  }

  return {
    transport,
    get isTrusted() {
      return isTrusted
    },
    get status() {
      return status
    },
    get connectionError() {
      return connectionError
    },
    requestTrust,
    requestTrustWithToken,
    requestTrustWithCode,
    ensureTrusted,
    call: (...args: any): any => {
      const method = String(args[0])
      const failFast = terminalError()
      if (failFast) {
        events.emit(DEVFRAME_EVENTS.client.error, failFast, method)
        return Promise.reject(failFast)
      }
      return guardCall(
        serverRpc.$call(
          // @ts-expect-error casting
          ...args,
        ),
        method,
      )
    },
    callEvent: (...args: any): any => {
      // Events are fire-and-forget; when the connection is down there's nothing
      // to send, so surface the failure and drop it instead of queuing forever.
      const failFast = terminalError()
      if (failFast) {
        events.emit(DEVFRAME_EVENTS.client.error, failFast, String(args[0]))
        return
      }
      return serverRpc.$callEvent(
        // @ts-expect-error casting
        ...args,
      )
    },
    callOptional: (...args: any): any => {
      const method = String(args[0])
      const failFast = terminalError()
      if (failFast) {
        events.emit(DEVFRAME_EVENTS.client.error, failFast, method)
        return Promise.reject(failFast)
      }
      return guardCall(
        serverRpc.$callOptional(
          // @ts-expect-error casting
          ...args,
        ),
        method,
      )
    },
    close: () => {
      channel.close()
    },
  }
}
