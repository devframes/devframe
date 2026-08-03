import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * A tiny, zero-dependency [Standard Schema](https://standardschema.dev/)
 * builder.
 *
 * Devframe's RPC and CLI-flag layers accept **any** Standard Schema
 * validator — valibot, zod, arktype, and others — so bring your own if you
 * already use one. This builder exists so devframe's own recipes (and
 * simple apps) can declare `args`/`returns`/flag schemas without pulling in
 * a validator dependency at all. It implements only the primitives those
 * surfaces need.
 *
 * ```ts
 * import { s } from 'devframe/utils/schema'
 *
 * defineRpcFunction({
 *   name: 'greet',
 *   args: [s.object({ name: s.string() })],
 *   returns: s.string(),
 *   handler: ({ name }) => `hi ${name}`,
 * })
 * ```
 */

/**
 * A Standard Schema produced by this builder. It carries a duck-typed
 * `type` marker (and `wrapped` for wrappers) alongside the standard
 * `~standard` prop so the CLI-flags adapter can introspect the schema kind
 * without importing any validator.
 */
export interface DevframeSchema<Input, Output = Input> extends StandardSchemaV1<Input, Output> {
  /** Schema kind marker, e.g. `'string'`, `'boolean'`, `'optional'`. */
  readonly type: string
  /** Inner schema for wrapper kinds (`optional` / `nullable`). */
  readonly wrapped?: StandardSchemaV1
  /** Optional human description (surfaced as CLI option help). */
  readonly description?: string
}

type Issue = StandardSchemaV1.Issue

function ok<T>(value: T): StandardSchemaV1.Result<T> {
  return { value }
}

function fail(message: string, path?: Issue['path']): StandardSchemaV1.FailureResult {
  return { issues: [path ? { message, path } : { message }] }
}

function make<I, O = I>(
  type: string,
  validate: StandardSchemaV1.Props<I, O>['validate'],
  extra?: Record<string, unknown>,
): DevframeSchema<I, O> {
  return {
    type,
    ...extra,
    '~standard': {
      version: 1,
      vendor: 'devframe',
      validate,
    },
  } as DevframeSchema<I, O>
}

/** Run a Standard Schema synchronously, rejecting async validators. */
function runSync<T extends StandardSchemaV1>(
  schema: T,
  value: unknown,
): StandardSchemaV1.Result<StandardSchemaV1.InferOutput<T>> {
  const result = schema['~standard'].validate(value)
  if (result instanceof Promise)
    throw new TypeError('[devframe/utils/schema] async validators are not supported inside object()/optional()/nullable()')
  return result
}

/** Any string. */
export function string(): DevframeSchema<string> {
  return make('string', v => (typeof v === 'string' ? ok(v) : fail('Expected a string')))
}

/** A finite number (rejects `NaN`). */
export function number(): DevframeSchema<number> {
  return make('number', v => (typeof v === 'number' && !Number.isNaN(v) ? ok(v) : fail('Expected a number')))
}

/** A boolean. */
export function boolean(): DevframeSchema<boolean> {
  return make('boolean', v => (typeof v === 'boolean' ? ok(v) : fail('Expected a boolean')))
}

/** `undefined` — mirrors valibot's `void`. */
export function voidType(): DevframeSchema<void> {
  return make('void', v => (v === undefined ? ok(undefined) : fail('Expected undefined')))
}

/** `null`. */
export function nullType(): DevframeSchema<null> {
  return make('null', v => (v === null ? ok(null) : fail('Expected null')))
}

/** One of a fixed set of literal values. */
export function picklist<const T extends readonly (string | number | boolean)[]>(
  values: T,
): DevframeSchema<T[number]> {
  const set = new Set<unknown>(values)
  return make(
    'picklist',
    v => (set.has(v) ? ok(v as T[number]) : fail(`Expected one of: ${values.join(', ')}`)),
    { values },
  )
}

/** An array whose every element satisfies the item schema. */
export function array<T extends StandardSchemaV1>(
  item: T,
): DevframeSchema<StandardSchemaV1.InferInput<T>[], StandardSchemaV1.InferOutput<T>[]> {
  return make('array', (v) => {
    if (!Array.isArray(v))
      return fail('Expected an array')
    const issues: Issue[] = []
    for (let i = 0; i < v.length; i++) {
      const result = runSync(item, v[i])
      if (result.issues) {
        for (const issue of result.issues)
          issues.push({ message: issue.message, path: [i, ...(issue.path ?? [])] })
      }
    }
    return issues.length ? { issues } : ok(v as any)
  })
}

/** An object whose known keys each satisfy their schema (extra keys are kept). */
export function object<T extends Record<string, StandardSchemaV1>>(
  shape: T,
): DevframeSchema<
  { [K in keyof T]: StandardSchemaV1.InferInput<T[K]> },
  { [K in keyof T]: StandardSchemaV1.InferOutput<T[K]> }
> {
  const entries = Object.entries(shape)
  return make('object', (v) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v))
      return fail('Expected an object')
    const obj = v as Record<string, unknown>
    const issues: Issue[] = []
    for (const [key, schema] of entries) {
      const result = runSync(schema, obj[key])
      if (result.issues) {
        for (const issue of result.issues)
          issues.push({ message: issue.message, path: [key, ...(issue.path ?? [])] })
      }
    }
    // Guard-only: return the original object so extra keys survive.
    return issues.length ? { issues } : ok(v as any)
  })
}

/** Allow `undefined` in addition to the inner schema. */
export function optional<T extends StandardSchemaV1>(
  inner: T,
): DevframeSchema<StandardSchemaV1.InferInput<T> | undefined, StandardSchemaV1.InferOutput<T> | undefined> {
  return make(
    'optional',
    v => (v === undefined ? ok(undefined) : runSync(inner, v)),
    { wrapped: inner },
  )
}

/** Allow `null` in addition to the inner schema. */
export function nullable<T extends StandardSchemaV1>(
  inner: T,
): DevframeSchema<StandardSchemaV1.InferInput<T> | null, StandardSchemaV1.InferOutput<T> | null> {
  return make(
    'nullable',
    v => (v === null ? ok(null) : runSync(inner, v)),
    { wrapped: inner },
  )
}

/** Attach a human-readable description (used for CLI option help). */
export function describe<T extends DevframeSchema<any, any>>(schema: T, description: string): T {
  return { ...schema, description }
}

/**
 * Grouped access to every builder — `s.string()`, `s.object({ ... })`,
 * `s.void()`, etc. Handy for a valibot-like `import { s } from
 * 'devframe/utils/schema'` call site.
 */
export const s = {
  string,
  number,
  boolean,
  void: voidType,
  null: nullType,
  picklist,
  array,
  object,
  optional,
  nullable,
  describe,
} as const
