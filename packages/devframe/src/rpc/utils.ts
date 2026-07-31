import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { RpcArgsSchema, RpcReturnSchema } from './types'

/** Type-level assertion that two types are equal */
export type AssertEqual<X, Y>
  = (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : never

/** Infers TypeScript tuple type from a Standard Schema array */
export type InferArgsType<S extends RpcArgsSchema | undefined>
  = S extends readonly [] ? []
    : S extends readonly [infer H, ...infer T]
      ? H extends StandardSchemaV1
        ? T extends readonly StandardSchemaV1[]
          ? [StandardSchemaV1.InferInput<H>, ...InferArgsType<T>]
          : never
        : never
      : never

/** Infers TypeScript return type from a Standard Schema return schema */
export type InferReturnType<S extends RpcReturnSchema | undefined>
  = S extends RpcReturnSchema
    ? StandardSchemaV1.InferInput<S>
    : void
