import type { DevframeRpcClientMode } from './rpc'
import { DEVFRAME_RPC_DUMP_MANIFEST_FILENAME } from 'devframe/constants'
import { createStaticRpcCaller } from './static-rpc'

export interface CreateStaticRpcClientModeOptions {
  fetchJsonFromBases: (path: string) => Promise<any>
}

export async function createStaticRpcClientMode(
  options: CreateStaticRpcClientModeOptions,
): Promise<DevframeRpcClientMode> {
  const manifest = await options.fetchJsonFromBases(DEVFRAME_RPC_DUMP_MANIFEST_FILENAME)
  const staticCaller = createStaticRpcCaller(manifest, options.fetchJsonFromBases)

  return {
    isTrusted: true,
    // A static backend has no live socket; every call is a local fetch, so it
    // is "connected" for its whole life.
    status: 'connected',
    connectionError: null,
    requestTrust: async () => true,
    requestTrustWithToken: async () => true,
    // Static backends are always trusted, so there's nothing to exchange.
    requestTrustWithCode: async () => null,
    ensureTrusted: async () => true,
    call: (...args: any): any => staticCaller.call(
      args[0] as string,
      args.slice(1),
    ),
    callEvent: (...args: any): any => staticCaller.callEvent(
      args[0] as string,
      args.slice(1),
    ),
    callOptional: (...args: any): any => staticCaller.callOptional(
      args[0] as string,
      args.slice(1),
    ),
  }
}
