import type {
  StaticRpcDumpCollection as _StaticRpcDumpCollection,
  StaticRpcDumpFile as _StaticRpcDumpFile,
  StaticRpcDumpManifest as _StaticRpcDumpManifest,
  StaticRpcDumpManifestQueryEntry as _StaticRpcDumpManifestQueryEntry,
  StaticRpcDumpManifestStaticEntry as _StaticRpcDumpManifestStaticEntry,
  StaticRpcDumpManifestValue as _StaticRpcDumpManifestValue,
  StaticRpcDumpSerialization as _StaticRpcDumpSerialization,
} from './dump/static'
import {
  createClientFromDump as _createClientFromDump,
  dumpFunctions as _dumpFunctions,
  getDefinitionsWithDumps as _getDefinitionsWithDumps,
} from './dump'
import {
  reviveDumpError as _reviveDumpError,
  serializeDumpError as _serializeDumpError,
} from './dump/error'
import {
  collectStaticRpcDump as _collectStaticRpcDump,
} from './dump/static'

export * from './cache'
export * from './collector'
export * from './define'
export * from './handler'
export * from './serialization'
export * from './types'
export * from './validation'

/** @deprecated Import from `devframe/rpc/dump` instead. */
export const collectStaticRpcDump = _collectStaticRpcDump
/** @deprecated Import from `devframe/rpc/dump` instead. */
export const createClientFromDump = _createClientFromDump
/** @deprecated Import from `devframe/rpc/dump` instead. */
export const dumpFunctions = _dumpFunctions
/** @deprecated Import from `devframe/rpc/dump` instead. */
export const getDefinitionsWithDumps = _getDefinitionsWithDumps
/** @deprecated Import from `devframe/rpc/dump` instead. */
export const reviveDumpError = _reviveDumpError
/** @deprecated Import from `devframe/rpc/dump` instead. */
export const serializeDumpError = _serializeDumpError

/** @deprecated Import from `devframe/rpc/dump` instead. */
export type StaticRpcDumpCollection = _StaticRpcDumpCollection
/** @deprecated Import from `devframe/rpc/dump` instead. */
export type StaticRpcDumpFile = _StaticRpcDumpFile
/** @deprecated Import from `devframe/rpc/dump` instead. */
export type StaticRpcDumpManifest = _StaticRpcDumpManifest
/** @deprecated Import from `devframe/rpc/dump` instead. */
export type StaticRpcDumpManifestQueryEntry = _StaticRpcDumpManifestQueryEntry
/** @deprecated Import from `devframe/rpc/dump` instead. */
export type StaticRpcDumpManifestStaticEntry = _StaticRpcDumpManifestStaticEntry
/** @deprecated Import from `devframe/rpc/dump` instead. */
export type StaticRpcDumpManifestValue = _StaticRpcDumpManifestValue
/** @deprecated Import from `devframe/rpc/dump` instead. */
export type StaticRpcDumpSerialization = _StaticRpcDumpSerialization
