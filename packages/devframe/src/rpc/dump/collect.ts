import type {
  BirpcReturn,
  RpcDefinitionsToFunctions,
  RpcDumpClientOptions,
  RpcDumpCollectionOptions,
  RpcDumpDefinition,
  RpcDumpStore,
  RpcFunctionDefinitionAny,
} from '../types'
import { hash } from 'devframe/utils/hash'
import pLimit from 'p-limit'
import { diagnostics } from '../diagnostics'
import { validateDefinitions } from '../validation'
import { reviveDumpError, serializeDumpError } from './error'

function getDumpRecordKey(functionName: string, args: any[]): string {
  const argsHash = hash(args)
  return `${functionName}---${argsHash}`
}

function getDumpFallbackKey(functionName: string): string {
  return `${functionName}---fallback`
}

async function resolveGetter<T>(valueOrGetter: T | (() => Promise<T>)): Promise<T> {
  return typeof valueOrGetter === 'function'
    ? await (valueOrGetter as () => Promise<T>)()
    : valueOrGetter
}

/**
 * Collects pre-computed dumps by executing functions with their defined input combinations.
 * Static functions without dump config automatically get `{ inputs: [[]] }`.
 *
 * @example
 * ```ts
 * const store = await dumpFunctions([greet], context, { concurrency: 10 })
 * ```
 */
interface TaskResolution {
  handler: (...args: any[]) => any
  dump: RpcDumpDefinition
  definition: RpcFunctionDefinitionAny
}

/** Run tasks sequentially (`concurrency <= 1`) or through a `p-limit` pool. */
async function runDumpTasks<R>(tasks: Array<() => Promise<R>>, concurrency: number): Promise<R[]> {
  if (concurrency <= 1) {
    const out: R[] = []
    for (const task of tasks)
      out.push(await task())
    return out
  }
  const limit = pLimit(concurrency)
  return Promise.all(tasks.map(task => limit(task)))
}

/**
 * Resolve one definition's handler + dump config and register it in the store.
 * Returns `undefined` for definitions that carry no dump.
 */
async function resolveDumpTask(
  definition: RpcFunctionDefinitionAny,
  context: any,
  store: RpcDumpStore,
): Promise<TaskResolution | undefined> {
  if (definition.type === 'event' || definition.type === 'action')
    return undefined

  // Fresh setup results for each context to avoid caching issues.
  const setupResult = definition.setup
    ? await Promise.resolve(definition.setup(context))
    : {}

  const handler = setupResult.handler || definition.handler
  if (!handler)
    throw diagnostics.DF0024({ name: definition.name })

  let dump = setupResult.dump ?? definition.dump
  if (!dump && definition.type === 'static')
    dump = { inputs: [[]] }
  if (!dump && definition.snapshot) {
    // Sugar: run the handler once with no args, store the result as both the
    // no-args record and the fallback - matching NMI's "getPayload() always
    // returns the baked dump" shape.
    dump = async (_ctx, h) => {
      const output = await Promise.resolve(h())
      return { records: [{ inputs: [] as any, output }], fallback: output }
    }
  }
  if (!dump)
    return undefined

  if (typeof dump === 'function')
    dump = await Promise.resolve(dump(context, handler))

  store.definitions[definition.name] = { name: definition.name, type: definition.type }
  return { handler, dump, definition }
}

/**
 * Write a resolved dump's pre-defined records and fallback into the store, and
 * return the per-input execution tasks that fill in the rest.
 */
function collectDumpTasks(resolution: TaskResolution, store: RpcDumpStore): Array<() => Promise<void>> {
  const { definition, handler, dump } = resolution
  const { inputs, records, fallback } = dump

  if (records) {
    for (const record of records)
      store.records[getDumpRecordKey(definition.name, record.inputs)] = record
  }
  if ('fallback' in dump)
    store.records[getDumpFallbackKey(definition.name)] = { inputs: [], output: fallback }

  if (!inputs)
    return []
  return inputs.map(input => async () => {
    const recordKey = getDumpRecordKey(definition.name, input)
    try {
      store.records[recordKey] = { inputs: input, output: await Promise.resolve(handler(...input)) }
    }
    catch (error: unknown) {
      store.records[recordKey] = { inputs: input, error: serializeDumpError(error) }
    }
  })
}

export async function dumpFunctions<
  T extends readonly RpcFunctionDefinitionAny[],
>(
  definitions: T,
  context?: any,
  options: RpcDumpCollectionOptions = {},
): Promise<RpcDumpStore<RpcDefinitionsToFunctions<T>>> {
  validateDefinitions(definitions)
  const concurrency = options.concurrency === true
    ? 5
    : options.concurrency === false || options.concurrency == null
      ? 1
      : options.concurrency

  const store: RpcDumpStore = {
    definitions: {},
    records: {},
  }

  const resolutions = await runDumpTasks(
    definitions.map(definition => () => resolveDumpTask(definition, context, store)),
    concurrency,
  )
  const functionsToDump = resolutions.filter((x): x is TaskResolution => !!x)

  const dumpTasks = functionsToDump.flatMap(resolution => collectDumpTasks(resolution, store))
  await runDumpTasks(dumpTasks, concurrency)

  return store
}

/**
 * Creates a client that serves pre-computed results from a dump store.
 * Uses argument hashing to match calls to stored records.
 *
 * @example
 * ```ts
 * const client = createClientFromDump(store)
 * await client.greet('Alice')
 * ```
 */
export function createClientFromDump<T extends Record<string, any>>(
  store: RpcDumpStore<T>,
  options: RpcDumpClientOptions = {},
): BirpcReturn<T> {
  const { onMiss } = options

  const client = new Proxy({} as BirpcReturn<T>, {
    get(_, functionName: string) {
      if (!(functionName in store.definitions)) {
        throw diagnostics.DF0025({ name: functionName })
      }

      return async (...args: any[]) => {
        const recordKey = getDumpRecordKey(functionName, args)

        const recordOrGetter = store.records[recordKey]

        if (recordOrGetter) {
          const record = await resolveGetter(recordOrGetter)

          if (record.error) {
            throw reviveDumpError(record.error)
          }

          if (typeof record.output === 'function') {
            return await record.output()
          }

          return record.output
        }

        onMiss?.(functionName, args)

        const fallbackKey = getDumpFallbackKey(functionName)
        if (fallbackKey in store.records) {
          const fallbackOrGetter = store.records[fallbackKey]

          const fallbackRecord = await resolveGetter(fallbackOrGetter)

          if (fallbackRecord && typeof fallbackRecord.output === 'function') {
            return await fallbackRecord.output()
          }
          if (fallbackRecord)
            return fallbackRecord.output
        }

        throw diagnostics.DF0026({ name: functionName, args: JSON.stringify(args) })
      }
    },
    has(_, functionName: string) {
      return functionName in store.definitions
    },
    ownKeys() {
      return Object.keys(store.definitions)
    },
    getOwnPropertyDescriptor(_, functionName: string) {
      return functionName in store.definitions
        ? { configurable: true, enumerable: true, value: undefined }
        : undefined
    },
  })

  return client
}

/**
 * Filters function definitions to only those with dump definitions.
 * Note: Only checks the definition itself, not setup results.
 */
export function getDefinitionsWithDumps<T extends readonly RpcFunctionDefinitionAny[]>(
  definitions: T,
): RpcFunctionDefinitionAny[] {
  return definitions.filter(def => def.dump !== undefined)
}
