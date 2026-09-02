import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { capabilities } from './functions/capabilities'
import { deleteAssets } from './functions/delete'
import { list } from './functions/list'
import { mkdir } from './functions/mkdir'
import { readImageMeta } from './functions/read-image-meta'
import { readText } from './functions/read-text'
import { rename } from './functions/rename'
import { upload } from './functions/upload'

/** Read-only RPC - always registered. */
export const readFunctions = [list, readImageMeta, readText, capabilities] as const

/** Mutating RPC - registered only when write actions are enabled. */
export const writeFunctions = [upload, rename, deleteAssets, mkdir] as const

export const serverFunctions = [...readFunctions, ...writeFunctions] as const

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}

export type { AssetsCapabilities } from './functions/capabilities'
export { capabilities } from './functions/capabilities'
export { deleteAssets } from './functions/delete'
export { assetInfoSchema, list } from './functions/list'
export { mkdir } from './functions/mkdir'
export { readImageMeta } from './functions/read-image-meta'
export { readText } from './functions/read-text'
export type { RenameArgs } from './functions/rename'
export { rename } from './functions/rename'
export { upload, UPLOAD_CHANNEL } from './functions/upload'
