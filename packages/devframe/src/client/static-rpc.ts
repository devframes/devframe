import type { RpcDumpRecordError } from '../rpc/types'
import { hash } from 'devframe/utils/hash'
import { structuredCloneDeserialize } from 'devframe/utils/structured-clone'
import { reviveDumpError } from '../rpc/dump/error'

export type StaticRpcSerialization = 'json' | 'structured-clone'

export interface StaticRpcManifestStaticEntry {
  type: 'static'
  path: string
  /** Encoder used when this entry's file was written. Default: `'json'`. */
  serialization?: StaticRpcSerialization
}

export interface StaticRpcManifestQueryEntry {
  type: 'query'
  records: Record<string, string>
  fallback?: string
  /** Encoder used when each record/fallback file was written. Default: `'json'`. */
  serialization?: StaticRpcSerialization
}

export type StaticRpcManifestEntry
  = | StaticRpcManifestStaticEntry
    | StaticRpcManifestQueryEntry
    | any

export type StaticRpcManifest = Record<string, StaticRpcManifestEntry>

export interface StaticRpcRecord {
  inputs?: any[]
  output?: any
  error?: RpcDumpRecordError
}

function isStaticEntry(value: unknown): value is StaticRpcManifestStaticEntry {
  return typeof value === 'object'
    && value !== null
    && (value as any).type === 'static'
    && typeof (value as any).path === 'string'
}

function isQueryEntry(value: unknown): value is StaticRpcManifestQueryEntry {
  return typeof value === 'object'
    && value !== null
    && (value as any).type === 'query'
    && typeof (value as any).records === 'object'
    && (value as any).records !== null
}

function isRecord(value: unknown): value is StaticRpcRecord {
  return typeof value === 'object'
    && value !== null
    && ('output' in (value as any) || 'error' in (value as any))
}

function resolveRecordOutput(record: StaticRpcRecord): any {
  if (record.error)
    throw reviveDumpError(record.error)
  return record.output
}

// Placeholder args (`[null]`/`[undefined]`) from framework setup hooks carry no
// addressing info and must be treated as a no-arg call.
function hasMeaningfulArgs(args: any[]): boolean {
  return args.some(arg => arg !== null && arg !== undefined)
}

// `collectStaticRpcDump`/`StaticRpcDumpFile` are public, so consumers may persist
// the whole `{ serialization, fnName, data }` envelope instead of just `data`.
function unwrapEnvelope(raw: unknown): unknown {
  if (
    raw !== null
    && typeof raw === 'object'
    && 'serialization' in raw
    && 'data' in raw
  ) {
    return (raw as { data: unknown }).data
  }
  return raw
}

export function createStaticRpcCaller(
  manifest: StaticRpcManifest,
  fetchJson: (path: string) => Promise<any>,
) {
  const staticCache = new Map<string, Promise<any>>()
  const queryRecordCache = new Map<string, Promise<StaticRpcRecord>>()

  function reviveIfStructuredClone(value: unknown, serialization: StaticRpcSerialization | undefined): any {
    // structured-clone-es always encodes to a records array; a non-array here
    // means the payload was not SC-encoded, so pass it through untouched.
    if (serialization === 'structured-clone' && Array.isArray(value))
      return structuredCloneDeserialize(value)
    return value
  }

  function decode(raw: unknown, serialization: StaticRpcSerialization | undefined): any {
    return reviveIfStructuredClone(unwrapEnvelope(raw), serialization)
  }

  async function loadStatic(entry: StaticRpcManifestStaticEntry): Promise<any> {
    if (!staticCache.has(entry.path)) {
      staticCache.set(
        entry.path,
        fetchJson(entry.path).then(raw => decode(raw, entry.serialization)),
      )
    }
    const data = await staticCache.get(entry.path)!
    if (isRecord(data)) {
      return resolveRecordOutput(data)
    }
    return data
  }

  async function loadQueryRecord(
    path: string,
    serialization: StaticRpcSerialization | undefined,
  ): Promise<StaticRpcRecord> {
    if (!queryRecordCache.has(path)) {
      queryRecordCache.set(
        path,
        fetchJson(path).then(raw => decode(raw, serialization)),
      )
    }
    return await queryRecordCache.get(path)!
  }

  async function call(functionName: string, args: any[]) {
    if (!(functionName in manifest)) {
      throw new Error(`[devframe-rpc] Function "${functionName}" not found in dump store`)
    }

    const entry = manifest[functionName]
    if (isStaticEntry(entry)) {
      if (hasMeaningfulArgs(args)) {
        throw new Error(
          `[devframe-rpc] No dump match for "${functionName}" with args: ${JSON.stringify(args)}`,
        )
      }
      return await loadStatic(entry)
    }

    if (isQueryEntry(entry)) {
      const argsHash = hash(args)
      const recordPath = entry.records[argsHash]

      if (recordPath) {
        const record = await loadQueryRecord(recordPath, entry.serialization)
        return resolveRecordOutput(record)
      }

      if (entry.fallback) {
        const fallback = await loadQueryRecord(entry.fallback, entry.serialization)
        return resolveRecordOutput(fallback)
      }

      throw new Error(
        `[devframe-rpc] No dump match for "${functionName}" with args: ${JSON.stringify(args)}`,
      )
    }

    if (!hasMeaningfulArgs(args)) {
      return entry
    }

    throw new Error(
      `[devframe-rpc] No dump match for "${functionName}" with args: ${JSON.stringify(args)}`,
    )
  }

  return {
    call: async (functionName: string, args: any[]) => await call(functionName, args),
    callOptional: async (functionName: string, args: any[]) => {
      if (!(functionName in manifest))
        return undefined
      return await call(functionName, args)
    },
    callEvent: async (_functionName: string, _args: any[]) => {
      return undefined
    },
  }
}
