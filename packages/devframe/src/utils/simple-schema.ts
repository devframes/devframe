import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * A tiny, zero-dependency [Standard Schema](https://standardschema.dev/)
 * builder.
 *
 * ⚠️ **Discouraged for app code.** This is a deliberately minimal,
 * best-effort validator that exists only so devframe's own first-party
 * packages (recipes, built-in plugins) can declare `args`/`returns`/flag
 * schemas without taking on a validator dependency. It implements a small
 * subset of primitives and approximates refinements — it is not a
 * general-purpose validator.
 *
 * For your own code, prefer a real Standard Schema validator — **valibot**,
 * **zod**, or **arktype**. Devframe's RPC and CLI-flag layers accept any of
 * them; install the one you like and use it directly:
 *
 * ```ts
 * import * as v from 'valibot' // npm i valibot
 *
 * defineRpcFunction({
 *   name: 'greet',
 *   args: [v.object({ name: v.string() })],
 *   returns: v.string(),
 *   handler: ({ name }) => `hi ${name}`,
 * })
 * ```
 */

/**
 * A Standard Schema produced by the {@link s} builder. It carries a
 * duck-typed `type` marker (and `wrapped` for wrappers) alongside the
 * standard `~standard` prop so the CLI-flags adapter can introspect the
 * schema kind without importing any validator.
 */
export interface SimpleSchema<Input, Output = Input> extends StandardSchemaV1<Input, Output> {
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
): SimpleSchema<I, O> {
  return {
    type,
    ...extra,
    '~standard': {
      version: 1,
      vendor: 'devframe',
      validate,
    },
  } as SimpleSchema<I, O>
}

/** Run a Standard Schema synchronously, rejecting async validators. */
function runSync<T extends StandardSchemaV1>(
  schema: T,
  value: unknown,
): StandardSchemaV1.Result<StandardSchemaV1.InferOutput<T>> {
  const result = schema['~standard'].validate(value)
  if (result instanceof Promise)
    throw new TypeError('[devframe/utils/simple-schema] async validators are not supported inside object()/optional()/nullable()')
  return result
}

/** Any string. */
export function string(): SimpleSchema<string> {
  return make('string', v => (typeof v === 'string' ? ok(v) : fail('Expected a string')))
}

/** A finite number (rejects `NaN`). */
export function number(): SimpleSchema<number> {
  return make('number', v => (typeof v === 'number' && !Number.isNaN(v) ? ok(v) : fail('Expected a number')))
}

/** A boolean. */
export function boolean(): SimpleSchema<boolean> {
  return make('boolean', v => (typeof v === 'boolean' ? ok(v) : fail('Expected a boolean')))
}

/** `undefined` — mirrors valibot's `void`. */
export function voidType(): SimpleSchema<void> {
  return make('void', v => (v === undefined ? ok(undefined) : fail('Expected undefined')))
}

/** `null`. */
export function nullType(): SimpleSchema<null> {
  return make('null', v => (v === null ? ok(null) : fail('Expected null')))
}

/** One of a fixed set of literal values. */
export function picklist<const T extends readonly (string | number | boolean)[]>(
  values: T,
): SimpleSchema<T[number]> {
  const set = new Set<unknown>(values)
  return make(
    'picklist',
    v => (set.has(v) ? ok(v as T[number]) : fail(`Expected one of: ${values.join(', ')}`)),
    { values },
  )
}

/** A single literal value (string / number / boolean). */
export function literal<const T extends string | number | boolean>(value: T): SimpleSchema<T> {
  return make('literal', v => (v === value ? ok(v as T) : fail(`Expected ${JSON.stringify(value)}`)), { value })
}

/** A value matching any one of the given schemas. */
export function union<const T extends readonly StandardSchemaV1[]>(
  options: T,
): SimpleSchema<StandardSchemaV1.InferInput<T[number]>, StandardSchemaV1.InferOutput<T[number]>> {
  return make('union', (v) => {
    const issues: Issue[] = []
    for (const option of options) {
      const result = runSync(option, v)
      if (!result.issues)
        return ok(v as any)
      issues.push(...result.issues)
    }
    return { issues }
  }, { options })
}

/** A record with string keys whose values each satisfy the value schema. */
export function record<V extends StandardSchemaV1>(
  _key: StandardSchemaV1,
  value: V,
): SimpleSchema<Record<string, StandardSchemaV1.InferInput<V>>, Record<string, StandardSchemaV1.InferOutput<V>>> {
  return make('record', (v) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v))
      return fail('Expected an object')
    const obj = v as Record<string, unknown>
    const issues: Issue[] = []
    for (const key of Object.keys(obj)) {
      const result = runSync(value, obj[key])
      if (result.issues) {
        for (const issue of result.issues)
          issues.push({ message: issue.message, path: [key, ...(issue.path ?? [])] })
      }
    }
    return issues.length ? { issues } : ok(v as any)
  })
}

/** An array whose every element satisfies the item schema. */
export function array<T extends StandardSchemaV1>(
  item: T,
): SimpleSchema<StandardSchemaV1.InferInput<T>[], StandardSchemaV1.InferOutput<T>[]> {
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

/** Flatten an intersection into a single object literal for readable types. */
type Prettify<T> = { [K in keyof T]: T[K] } & {}

/**
 * Map a shape to its object type, turning fields whose type includes
 * `undefined` (i.e. `optional()`) into optional keys — mirroring how
 * valibot/zod render `optional` object entries.
 */
type InferField<T extends StandardSchemaV1, Mode extends 'input' | 'output'>
  = Mode extends 'input' ? StandardSchemaV1.InferInput<T> : StandardSchemaV1.InferOutput<T>

type InferObject<T extends Record<string, StandardSchemaV1>, Mode extends 'input' | 'output'> = Prettify<
  & { [K in keyof T as undefined extends InferField<T[K], Mode> ? never : K]: InferField<T[K], Mode> }
  & { [K in keyof T as undefined extends InferField<T[K], Mode> ? K : never]?: InferField<T[K], Mode> }
>

/** An object whose known keys each satisfy their schema (extra keys are kept). */
export function object<T extends Record<string, StandardSchemaV1>>(
  shape: T,
): SimpleSchema<InferObject<T, 'input'>, InferObject<T, 'output'>> {
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
): SimpleSchema<StandardSchemaV1.InferInput<T> | undefined, StandardSchemaV1.InferOutput<T> | undefined> {
  return make(
    'optional',
    v => (v === undefined ? ok(undefined) : runSync(inner, v)),
    { wrapped: inner },
  )
}

/** Allow `null` in addition to the inner schema. */
export function nullable<T extends StandardSchemaV1>(
  inner: T,
): SimpleSchema<StandardSchemaV1.InferInput<T> | null, StandardSchemaV1.InferOutput<T> | null> {
  return make(
    'nullable',
    v => (v === null ? ok(null) : runSync(inner, v)),
    { wrapped: inner },
  )
}

/** Attach a human-readable description (used for CLI option help). */
export function describe<T extends SimpleSchema<any, any>>(schema: T, description: string): T {
  return { ...schema, description }
}

/**
 * Grouped access to every builder — `s.string()`, `s.object({ ... })`,
 * `s.void()`, etc. Handy for a valibot-like `import { s } from
 * 'devframe/utils/simple-schema'` call site.
 */
export const s = {
  string,
  number,
  boolean,
  void: voidType,
  null: nullType,
  literal,
  picklist,
  union,
  record,
  array,
  object,
  optional,
  nullable,
  describe,
} as const
