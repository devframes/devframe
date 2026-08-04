import { getDevframeRpcClient } from './rpc'

export * from './connection'
export * from './otp'
export * from './rpc'
export * from './rpc-streaming'
export { resolveWsUrl, type WsUrlLocation } from './rpc-ws'
export * from './scope'
export * from './settings'

export const connectDevframe = getDevframeRpcClient
