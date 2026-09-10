import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { InferArgsType, InferReturnType } from './utils'

export type { BirpcFn, BirpcReturn } from 'birpc'

export type Thenable<T> = T | Promise<T>

export type EntriesToObject<T extends readonly [string, any][]> = {
  [K in T[number] as K[0]]: K[1]
}

/**
 * Type of the RPC function,
 * - static: A function that returns a static data, no arguments (can be cached and dumped)
 * - action: A function that performs an action (no data returned)
 * - event: A function that emits an event (no data returned), and does not wait for a response
 * - query: A function that queries a resource
 *
 * By default, the function is a query function.
 */
export type RpcFunctionType = 'static' | 'action' | 'event' | 'query'

/**
 * Agent exposure settings for an RPC function. When this field is set,
 * the function is surfaced to agents (e.g. via the devframe MCP adapter)
 * as a callable tool. Functions without an `agent` field are not exposed;
 * default-deny.
 */
export interface RpcFunctionAgentOptions {
  /**
   * Human-readable description shown to the agent. Required, since agents
   * rely on this to decide when to invoke the tool. Keep it to ~1–3
   * sentences explaining what the tool does and when to use it.
   */
  description: string
  /**
   * Optional human-friendly display title. Maps to the MCP tool `title`
   * annotation. Falls back to the RPC function `name` when omitted.
   */
  title?: string
  /**
   * Safety classification. Drives MCP annotations (`readOnlyHint`,
   * `destructiveHint`) downstream.
   * - `'read'`: no side effects; safe to call freely.
   * - `'action'`: mutates state but not destructive.
   * - `'destructive'`: may perform destructive updates.
   *
   * When omitted it is inferred from the function `type`:
   *   - `'static'` / `'query'` → `'read'`
   *   - `'action'` / `'event'` → `'action'`
   */
  safety?: 'read' | 'action' | 'destructive'
  /** Free-form tags for grouping or filtering. */
  tags?: readonly string[]
  /**
   * Optional example invocations shown to agents. Returned verbatim in
   * the agent manifest.
   */
  examples?: readonly { args: unknown[], description?: string }[]
}

/**
 * Manages dynamic function registration and provides a type-safe proxy for accessing functions.
 */
export interface RpcFunctionsCollector<LocalFunctions, SetupContext = undefined> {
  /** User-provided context passed to setup functions */
  context: SetupContext
  /** Type-safe proxy for calling registered functions */
  readonly functions: LocalFunctions
  /** Map of registered function definitions keyed by function name */
  readonly definitions: Map<string, RpcFunctionDefinitionAnyWithContext<SetupContext>>
  /** Register a new function definition. Pass `force` to overwrite an existing one. */
  register: (fn: RpcFunctionDefinitionAnyWithContext<SetupContext>, force?: boolean) => void
  /** Update an existing function definition. Pass `force` to register it if it doesn't exist yet. */
  update: (fn: RpcFunctionDefinitionAnyWithContext<SetupContext>, force?: boolean) => void
  /** Subscribe to function changes, returns unsubscribe function */
  onChanged: (fn: (id?: string) => void) => (() => void)
}

/**
 * Result returned by a function's setup method.
 */
export interface RpcFunctionSetupResult<
  ARGS extends any[],
  RETURN = void,
> {
  /** Function handler */
  handler?: (...args: ARGS) => RETURN
  /** Optional dump definition (overrides definition-level dump) */
  dump?: RpcDumpDefinition<ARGS, RETURN>
}

/**
 * Positional argument schemas for an RPC function. Each entry is any
 * [Standard Schema](https://standardschema.dev)-compliant validator
 * (valibot, zod, arktype, …); the entry at index `i` validates argument
 * `i` at call time and drives that argument's inferred type.
 */
export type RpcArgsSchema = readonly StandardSchemaV1[]
/**
 * Return-value schema for an RPC function. Any
 * [Standard Schema](https://standardschema.dev)-compliant validator; it
 * validates the handler's resolved return value and drives its inferred
 * type.
 */
export type RpcReturnSchema = StandardSchemaV1

/**
 * Serialized representation of a thrown value in a dump record.
 *
 * Errors are stored as plain objects so they round-trip through both the
 * strict-JSON and structured-clone codecs. `message` and `name` are always
 * present; `cause` and any own enumerable properties of the original
 * `Error` are preserved on a best-effort basis. Non-`Error` throws are
 * normalized to `{ name: 'Error', message: String(thrown) }`.
 */
export interface RpcDumpRecordError {
  /** Error message (mirrors `Error.message`). */
  message: string
  /** Error type name (e.g., "Error", "TypeError"). */
  name: string
  /** `Error.cause`, recursively serialized when it is itself an `Error`. */
  cause?: unknown
  /** Own enumerable properties of the original error (excluding `message`/`name`/`cause`). */
  [key: string]: unknown
}

/**
 * Single record in a dump store with pre-computed results.
 */
export interface RpcDumpRecord<ARGS extends any[] = any[], RETURN = any> {
  /** Function arguments */
  inputs: ARGS
  /** Result (value or lazy function) */
  output?: RETURN
  /** Error if execution failed */
  error?: RpcDumpRecordError
}

/**
 * Defines argument combinations to pre-compute for a function.
 */
export interface RpcDumpDefinition<ARGS extends any[] = any[], RETURN = any> {
  /** Argument combinations to pre-compute by executing handler */
  inputs?: ARGS[]
  /** Pre-computed records to use directly (bypasses handler execution) */
  records?: RpcDumpRecord<ARGS, RETURN>[]
  /** Fallback value when no match found */
  fallback?: RETURN
}

/**
 * Dynamically generates dump definitions based on context.
 */
export type RpcDumpGetter<ARGS extends any[] = any[], RETURN = any, CONTEXT = any>
  = (context: CONTEXT, handler: (...args: ARGS) => RETURN) => Thenable<RpcDumpDefinition<ARGS, RETURN>>

/**
 * Dump configuration (static object or dynamic function).
 */
export type RpcDump<ARGS extends any[] = any[], RETURN = any, CONTEXT = any>
  = | RpcDumpDefinition<ARGS, RETURN>
    | RpcDumpGetter<ARGS, RETURN, CONTEXT>

/** Shared fields for an RPC function definition. */
export interface RpcFunctionDefinitionBase<
  NAME extends string = string,
  TYPE extends RpcFunctionType = RpcFunctionType,
  ARGS extends any[] = any[],
  RETURN = any,
  CONTEXT = any,
> {
  /** Function name (unique identifier) */
  name: NAME
  /** Function type (static, action, event, or query) */
  type?: TYPE
  /** Whether the function results should be cached */
  cacheable?: boolean
  /**
   * Selects the serialization format for arguments and return values.
   *
   * - `true`: uses strict JSON encoding (default when `agent` is set).
   * - `false` (default otherwise): uses structured-clone encoding and supports values
   *   such as `Map`, `Set`, `Date`, and cycles. Functions using this mode
   *   cannot be agent-exposed.
   */
  jsonSerializable?: boolean
  /**
   * Expose this function to agents (e.g. via the MCP adapter).
   * When omitted, the function is not agent-exposed (default-deny).
   */
  agent?: RpcFunctionAgentOptions
  /** Setup function called with context to initialize handler and dump */
  setup?: (context: CONTEXT) => Thenable<RpcFunctionSetupResult<ARGS, RETURN>>
  /** Function implementation (required if setup doesn't provide one) */
  handler?: (...args: ARGS) => RETURN
  /** Dump definition (setup dump takes priority) */
  dump?: RpcDump<ARGS, RETURN, CONTEXT>
  /**
   * Sugar for "query in dev, single baked snapshot in build": when
   * `true` and no `dump` is provided, the build adapter runs the
   * handler once with no arguments and stores the result as both a
   * no-args record and the fallback so any call variant resolves
   * to the same snapshot. Only valid on `query` (or untyped)
   * functions; `static` already has equivalent default behavior.
   */
  snapshot?: boolean
  /** Per-context setup-result cache, populated by `getRpcResolvedSetupResult`. @internal */
  __cache?: WeakMap<object, Thenable<RpcFunctionSetupResult<ARGS, RETURN>>>
  /** Single-slot fallback for primitive contexts. @internal */
  __promise?: Thenable<RpcFunctionSetupResult<ARGS, RETURN>>
}

/**
 * Dump store containing pre-computed results.
 * Flat structure for serialization and efficient lookups.
 */
export interface RpcDumpStore<T = any> {
  /** Function definitions keyed by name */
  definitions: Record<string, Pick<RpcFunctionDefinitionBase, 'name' | 'type'>>
  /** Records keyed by '<function-name>---<hash>' or '<function-name>---fallback' */
  records: Record<string, RpcDumpRecord | (() => Promise<RpcDumpRecord>)>
  /** @internal */
  _functions?: T
}

interface RpcFunctionDefinitionWithoutSchemas<
  NAME extends string,
  TYPE extends RpcFunctionType,
  ARGS extends any[],
  RETURN,
  AS extends RpcArgsSchema | undefined,
  RS extends RpcReturnSchema | undefined,
  CONTEXT,
> extends RpcFunctionDefinitionBase<NAME, TYPE, ARGS, RETURN, CONTEXT> {
  /** Standard Schema array validating (and typing) the arguments */
  args?: AS
  /** Standard Schema validating (and typing) the return value */
  returns?: RS
}

interface RpcFunctionDefinitionWithSchemas<
  NAME extends string,
  TYPE extends RpcFunctionType,
  AS extends RpcArgsSchema | undefined,
  RS extends RpcReturnSchema | undefined,
  CONTEXT,
> extends RpcFunctionDefinitionBase<
    NAME,
    TYPE,
    InferArgsType<AS>,
    Thenable<InferReturnType<RS>>,
    CONTEXT
  > {
  /** Standard Schema array validating (and typing) the arguments */
  args: AS
  /** Standard Schema validating (and typing) the resolved return value */
  returns: RS
}

/**
 * Dump client options.
 */
export interface RpcDumpClientOptions {
  /** Called when arguments don't match any pre-computed entry */
  onMiss?: (functionName: string, args: any[]) => void
}

/**
 * Options for collecting dumps.
 */
export interface RpcDumpCollectionOptions {
  /**
   * Concurrency control for parallel execution.
   * - `false` or `undefined`: sequential execution (default)
   * - `true`: parallel execution with concurrency limit of 5
   * - `number`: parallel execution with specified concurrency limit
   */
  concurrency?: boolean | number | null
}

/**
 * RPC function definition with optional dump support.
 */
export type RpcFunctionDefinition<
  NAME extends string,
  TYPE extends RpcFunctionType = 'query',
  ARGS extends any[] = [],
  RETURN = void,
  AS extends RpcArgsSchema | undefined = undefined,
  RS extends RpcReturnSchema | undefined = undefined,
  CONTEXT = undefined,
>
  = [AS, RS] extends [undefined, undefined]
    ? RpcFunctionDefinitionWithoutSchemas<NAME, TYPE, ARGS, RETURN, AS, RS, CONTEXT>
    : RpcFunctionDefinitionWithSchemas<NAME, TYPE, AS, RS, CONTEXT>

export type RpcFunctionDefinitionToFunction<T extends RpcFunctionDefinitionAny>
  = T extends { args: infer AS, returns: infer RS }
    ? AS extends RpcArgsSchema
      ? RS extends RpcReturnSchema
        ? (...args: InferArgsType<AS>) => InferReturnType<RS>
        : never
      : never
    : T extends RpcFunctionDefinition<string, any, infer ARGS, infer RETURN, any, any, any>
      ? (...args: ARGS) => RETURN
      : never

export type RpcFunctionDefinitionAny = RpcFunctionDefinition<string, any, any, any, any, any, any>
export type RpcFunctionDefinitionAnyWithContext<CONTEXT = undefined> = RpcFunctionDefinition<string, any, any, any, any, any, CONTEXT>

export type RpcDefinitionsToFunctions<T extends readonly RpcFunctionDefinitionAny[]> = EntriesToObject<{
  [K in keyof T]: [T[K]['name'], RpcFunctionDefinitionToFunction<T[K]>]
}>

/**
 * Like {@link RpcDefinitionsToFunctions}, but prefixes every (bare)
 * definition name with `<NS>:`. Use this when functions are defined with
 * bare names and registered through a scoped context
 * (`ctx.scope(NS).rpc.register(...)`), so the augmented registry keys
 * match the namespaced ids stored at runtime.
 */
export type RpcDefinitionsToFunctionsWithNamespace<
  NS extends string,
  T extends readonly RpcFunctionDefinitionAny[],
> = EntriesToObject<{
  [K in keyof T]: [`${NS}:${T[K]['name'] & string}`, RpcFunctionDefinitionToFunction<T[K]>]
}>

export type RpcDefinitionsFilter<
  T extends readonly RpcFunctionDefinitionAny[],
  Type extends RpcFunctionType,
> = {
  [K in keyof T]: T[K] extends { type: Type } ? T[K] : never
}
