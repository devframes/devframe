import type { ChannelOptions } from 'birpc'
import type { RpcFunctionDefinitionAny } from '../types'
import { DEVFRAME_AUTH_TOKEN_QUERY_PARAM } from 'devframe/constants'
import { createRpcWireCodec } from '../serialization'

export interface WsRpcChannelOptions {
  url: string
  onConnected?: (e: Event) => void
  onError?: (e: Error) => void
  onDisconnected?: (e: CloseEvent) => void
  authToken?: string
  /**
   * RPC function definitions (or just the `jsonSerializable` flag per
   * method) used to dispatch the per-call wire serializer. Pass an
   * empty / partial map on clients that don't have the full registry —
   * encoding falls back to structured-clone (the safer superset) and
   * decoding still routes correctly via the wire prefix.
   */
  definitions?: ReadonlyMap<string, Pick<RpcFunctionDefinitionAny, 'jsonSerializable'>>
}

function NOOP() {}

const EMPTY_DEFS: ReadonlyMap<string, Pick<RpcFunctionDefinitionAny, 'jsonSerializable'>> = new Map()

/**
 * Build a birpc `ChannelOptions` object backed by a browser `WebSocket`.
 * Pass the result straight to `createRpcClient`'s `channel` option.
 *
 * Also returns `close()`, closing the underlying socket — mirroring the server transport's
 * existing `WsRpcTransport.close()`. `birpc`'s own `ChannelOptions` has no teardown of its own.
 */
export function createWsRpcChannel(options: WsRpcChannelOptions): ChannelOptions & { close: () => void } {
  let url = options.url
  if (options.authToken) {
    url = `${url}?${DEVFRAME_AUTH_TOKEN_QUERY_PARAM}=${encodeURIComponent(options.authToken)}`
  }
  const ws = new WebSocket(url)
  const {
    onConnected = NOOP,
    onError = NOOP,
    onDisconnected = NOOP,
    definitions = EMPTY_DEFS,
  } = options

  ws.addEventListener('open', (e) => {
    onConnected(e)
  })

  ws.addEventListener('error', (e) => {
    const _e = e instanceof Error ? e : new Error(e.type)
    onError(_e)
  })

  ws.addEventListener('close', (e) => {
    onDisconnected(e)
  })

  // Per-channel wire codec — request-id → method bookkeeping included.
  const codec = createRpcWireCodec(definitions)
  return {
    close: () => {
      ws.close()
    },
    on: (handler: (data: string) => void) => {
      ws.addEventListener('message', (e) => {
        handler(e.data)
      })
    },
    post: (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
        return
      }
      if (ws.readyState === WebSocket.CONNECTING) {
        const onOpen = () => {
          cleanup()
          if (ws.readyState === WebSocket.OPEN)
            ws.send(data)
        }
        const onClose = () => cleanup()
        function cleanup() {
          ws.removeEventListener('open', onOpen)
          ws.removeEventListener('close', onClose)
        }
        ws.addEventListener('open', onOpen)
        ws.addEventListener('close', onClose) // drop the queued send if it closes first
        return
      }
      // CLOSING or CLOSED: the socket will never (re)open on this channel.
      onError(new Error('Devframe WebSocket is not open; message dropped'))
    },
    serialize: codec.serialize,
    deserialize: codec.deserialize,
  }
}
