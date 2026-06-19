import type { ConnectionMeta, DevframeRpcClientFunctions, DevframeRpcServerFunctions, EventEmitter } from 'devframe/types'
import type { DevframeClientRpcHost, DevframeRpcClientMode, DevframeRpcClientOptions, RpcClientEvents } from './rpc'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { promiseWithResolver } from 'devframe/utils/promise'
import { parseUA } from 'ua-parser-modern'

export interface CreateWsRpcClientModeOptions {
  authToken?: string
  connectionMeta: ConnectionMeta
  events: EventEmitter<RpcClientEvents>
  clientRpc: DevframeClientRpcHost
  rpcOptions?: DevframeRpcClientOptions['rpcOptions']
  wsOptions?: DevframeRpcClientOptions['wsOptions']
}

function isNumeric(str: string | number | undefined) {
  if (str == null)
    return false
  return `${+str}` === `${str}`
}

export function createWsRpcClientMode(
  options: CreateWsRpcClientModeOptions,
): DevframeRpcClientMode {
  const {
    authToken,
    connectionMeta,
    events,
    clientRpc,
    rpcOptions = {},
    wsOptions = {},
  } = options

  let isTrusted = false
  const trustedPromise = promiseWithResolver<boolean>()
  const url = isNumeric(connectionMeta.websocket)
    ? `${location.protocol.replace('http', 'ws')}//${location.hostname}:${connectionMeta.websocket}`
    : connectionMeta.websocket as string

  // Build a minimal `defs` map from the connection meta so the per-call
  // wire serializer dispatches outgoing requests with the correct
  // encoding (JSON for `jsonSerializable: true` methods; structured-
  // clone for the rest).
  const definitions = new Map<string, { jsonSerializable: true }>()
  for (const name of connectionMeta.jsonSerializableMethods ?? [])
    definitions.set(name, { jsonSerializable: true })

  const serverRpc = createRpcClient<DevframeRpcServerFunctions, DevframeRpcClientFunctions>(
    clientRpc.functions,
    {
      channel: createWsRpcChannel({
        url,
        authToken,
        definitions,
        ...wsOptions,
      }),
      rpcOptions,
    },
  )

  // Handle server-initiated auth revocation
  clientRpc.register({
    name: 'devframe:auth:revoked',
    type: 'event',
    handler: () => {
      isTrusted = false
      events.emit('rpc:is-trusted:updated', false)
    },
  })

  let currentAuthToken: string | undefined = authToken

  function describeUA(): string {
    const info = parseUA(navigator.userAgent)
    return [
      info.browser.name,
      info.browser.version,
      '|',
      info.os.name,
      info.os.version,
      info.device.type,
    ].filter(i => i).join(' ')
  }

  async function requestTrustWithToken(token: string) {
    currentAuthToken = token

    const result = await serverRpc.$call('devframe:anonymous:auth', {
      authToken: token,
      ua: describeUA(),
      origin: location.origin,
    })

    isTrusted = result.isTrusted
    // Only settle the trust gate on success; on failure the client can still
    // pair via `requestTrustWithCode`, so leave `ensureTrusted` waiting.
    if (isTrusted)
      trustedPromise.resolve(true)
    events.emit('rpc:is-trusted:updated', isTrusted)
    return result.isTrusted
  }

  async function requestTrustWithCode(code: string): Promise<string | null> {
    const result = await serverRpc.$call('devframe:auth:exchange', {
      code,
      ua: describeUA(),
      origin: location.origin,
    })

    const token = result?.authToken ?? null
    if (token) {
      currentAuthToken = token
      isTrusted = true
      trustedPromise.resolve(true)
      events.emit('rpc:is-trusted:updated', true)
    }
    return token
  }

  async function requestTrust() {
    if (isTrusted)
      return true
    // Always announce on connect. The standalone (`auth: false`) noop handler
    // auto-trusts regardless of token; the host adapter looks the token up and
    // returns `false` for an unpaired client (empty/unknown token), which then
    // pairs via `requestTrustWithCode`. The trust gate stays open until then.
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
    get isTrusted() {
      return isTrusted
    },
    requestTrust,
    requestTrustWithToken,
    requestTrustWithCode,
    ensureTrusted,
    call: (...args: any): any => {
      return serverRpc.$call(
        // @ts-expect-error casting
        ...args,
      )
    },
    callEvent: (...args: any): any => {
      return serverRpc.$callEvent(
        // @ts-expect-error casting
        ...args,
      )
    },
    callOptional: (...args: any): any => {
      return serverRpc.$callOptional(
        // @ts-expect-error casting
        ...args,
      )
    },
  }
}
