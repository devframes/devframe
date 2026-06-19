/**
 * To be extended
 */
export interface DevframeRpcClientFunctions {
  /**
   * Server→client notification that this connection's auth token has been
   * revoked. The client drops to untrusted on receipt. Broadcast by
   * `revokeActiveConnectionsForToken`.
   *
   * @internal
   */
  'devframe:auth:revoked': () => Promise<void>
  /**
   * Streaming chunk pushed from server to subscribed clients. Wired by
   * `RpcStreamingHost`; do not register manually.
   *
   * @internal
   */
  'devframe:streaming:chunk': (channel: string, id: string, seq: number, chunk: any) => Promise<void>
  /**
   * Streaming terminator pushed from server to subscribed clients. Wired by
   * `RpcStreamingHost`; do not register manually.
   *
   * @internal
   */
  'devframe:streaming:end': (channel: string, id: string, error?: { name: string, message: string }) => Promise<void>
  /**
   * Server→client cancel for an in-flight upload. Wired by
   * `RpcStreamingHost`; do not register manually.
   *
   * @internal
   */
  'devframe:streaming:upload-cancel': (channel: string, id: string) => Promise<void>
  /**
   * Full shared-state snapshot pushed from server to subscribed clients.
   * Wired by `RpcSharedStateHost`; do not register manually.
   *
   * @internal
   */
  'devframe:rpc:client-state:updated': (key: string, fullState: any, syncId: string) => Promise<void>
  /**
   * Incremental shared-state patch pushed from server to subscribed clients.
   * Wired by `RpcSharedStateHost`; do not register manually.
   *
   * @internal
   */
  'devframe:rpc:client-state:patch': (key: string, patches: any[], syncId: string) => Promise<void>
}

/**
 * To be extended
 */
export interface DevframeRpcServerFunctions {
  /**
   * Authenticate a connection with a previously-issued bearer token; resolves
   * whether the connection is now trusted. The interactive handler is provided
   * by the host adapter (e.g. Vite DevTools); the standalone server registers
   * an auto-trust noop when `auth: false`.
   *
   * @internal
   */
  'devframe:anonymous:auth': (params: { authToken: string, ua: string, origin: string }) => Promise<{ isTrusted: boolean }>
  /**
   * Exchange a one-time authentication code (shown by the dev server) for a fresh,
   * node-issued bearer token, returning the token on success or `null`. The
   * handler is provided by the host adapter on top of `exchangeTempAuthCode`.
   *
   * @internal
   */
  'devframe:auth:exchange': (params: { code: string, ua: string, origin: string }) => Promise<{ authToken: string | null }>
  /**
   * Subscribe a client to a shared-state key. Wired by
   * `RpcSharedStateHost`; do not register manually.
   *
   * @internal
   */
  'devframe:rpc:server-state:subscribe': (key: string) => Promise<void>
  /**
   * Read the current value for a shared-state key. Wired by
   * `RpcSharedStateHost`; do not register manually.
   *
   * @internal
   */
  'devframe:rpc:server-state:get': (key: string) => Promise<any>
  /**
   * Replace a shared-state value (from the client). Wired by
   * `RpcSharedStateHost`; do not register manually.
   *
   * @internal
   */
  'devframe:rpc:server-state:set': (key: string, value: any, syncId: string) => Promise<void>
  /**
   * Apply a patch to a shared-state value (from the client). Wired by
   * `RpcSharedStateHost`; do not register manually.
   *
   * @internal
   */
  'devframe:rpc:server-state:patch': (key: string, patches: any[], syncId: string) => Promise<void>
  /**
   * Client→server streaming subscription with optional replay cursor.
   * Wired by `RpcStreamingHost`; do not register manually.
   *
   * @internal
   */
  'devframe:streaming:subscribe': (channel: string, id: string, opts?: { afterSeq?: number }) => Promise<void>
  /**
   * Client→server streaming unsubscribe. Wired by `RpcStreamingHost`;
   * do not register manually.
   *
   * @internal
   */
  'devframe:streaming:unsubscribe': (channel: string, id: string) => Promise<void>
  /**
   * Client→server streaming cancellation request. Wired by
   * `RpcStreamingHost`; do not register manually.
   *
   * @internal
   */
  'devframe:streaming:cancel': (channel: string, id: string) => Promise<void>
  /**
   * Client→server upload chunk. Wired by `RpcStreamingHost`; do not
   * register manually.
   *
   * @internal
   */
  'devframe:streaming:upload-chunk': (channel: string, id: string, seq: number, chunk: any) => Promise<void>
  /**
   * Client→server upload terminator. Wired by `RpcStreamingHost`; do not
   * register manually.
   *
   * @internal
   */
  'devframe:streaming:upload-end': (channel: string, id: string, error?: { name: string, message: string }) => Promise<void>
}

/**
 * To be extended
 */
export interface DevframeRpcSharedStates {}
