import { getDevframeRpcClient } from './rpc'

export * from './connection'
export { storeConnection } from './connection-storage'
export * from './otp'
export * from './rpc'
export type { DevframeServiceClientHandle, DevframeServicesClient } from './rpc-services'
export { resolveSseUrl } from './rpc-sse'
export * from './rpc-streaming'
export { resolveWsUrl, type WsUrlLocation } from './rpc-ws'
export * from './scope'
export * from './settings'
export * from './webmcp'

export const connectDevframe = getDevframeRpcClient
