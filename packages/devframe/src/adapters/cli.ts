// Deprecated compatibility shim for the cac adapter.
//
// Prefer the canonical `devframe/adapters/cac` entry (`createCac`). This
// module re-exports the same implementation under the historical `cli`
// names so existing imports keep working. It will be removed in a future
// major release.
import type { CacHandle, CreateCacOptions } from './cac'
import { createCac } from './cac'

export { defineCliFlags, parseCliFlags } from './flags'
export type { CliFlagsSchema, InferCliFlags } from './flags'

/** @deprecated Use `createCac` from `devframe/adapters/cac` instead. */
export const createCli: typeof createCac = createCac

/** @deprecated Use `CreateCacOptions` from `devframe/adapters/cac` instead. */
export type CreateCliOptions = CreateCacOptions

/** @deprecated Use `CacHandle` from `devframe/adapters/cac` instead. */
export type CliHandle = CacHandle
