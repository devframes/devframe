import { getDevframeRpcClient } from './rpc'

export * from './rpc'
export * from './rpc-streaming'
export * from './scope'
export * from './settings'

export const connectDevframe = getDevframeRpcClient
