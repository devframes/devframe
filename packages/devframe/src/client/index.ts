import { getDevframeRpcClient } from './rpc'

export * from './otp'
export * from './rpc'
export * from './rpc-streaming'

export const connectDevframe = getDevframeRpcClient
