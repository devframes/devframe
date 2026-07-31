/* eslint-disable unused-imports/no-unused-vars */
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  RpcDefinitionsToFunctions,
  RpcFunctionDefinitionToFunction,
} from '.'
import type { AssertEqual } from './utils'
import * as v from 'valibot'
import { describe, it } from 'vitest'
import { defineRpcFunction } from '.'

/** Minimal Standard Schema implementation, for asserting inference works for any vendor. */
function fakeSchema<Input>(): StandardSchemaV1<Input> {
  return {
    '~standard': {
      version: 1,
      vendor: 'fake',
      validate: (value: unknown) => ({ value: value as Input }),
      types: { input: undefined as Input, output: undefined as Input },
    },
  }
}

describe('rpcFunctionDefinitionToFunction', () => {
  it('should infer types from generic parameters when no schemas', () => {
    const fn = defineRpcFunction({
      name: 'noSchema',
      handler: (a: string, b: number) => {
        return a.length + b
      },
    })

    type Result = RpcFunctionDefinitionToFunction<typeof fn>
    type _Test = AssertEqual<Result, (a: string, b: number) => number>
  })

  it('should infer types from schemas when provided', () => {
    const fn = defineRpcFunction({
      name: 'withSchema',
      args: [v.string(), v.number()],
      returns: v.boolean(),
      handler: (a, b) => {
        return a.length > b
      },
    })

    type Result = RpcFunctionDefinitionToFunction<typeof fn>
    type _Test = AssertEqual<Result, (arg_0: string, arg_1: number) => boolean>
  })

  it('should infer void return from void schema', () => {
    const fn = defineRpcFunction({
      name: 'voidReturn',
      args: [v.string()],
      returns: v.void(),
      handler: (_a) => {},
    })

    type Result = RpcFunctionDefinitionToFunction<typeof fn>
    type _Test = AssertEqual<Result, (arg_0: string) => void>
  })

  it('should infer empty args from empty schema', () => {
    const fn = defineRpcFunction({
      name: 'noArgs',
      args: [],
      returns: v.number(),
      handler: () => 42,
    })

    type Result = RpcFunctionDefinitionToFunction<typeof fn>
    type _Test = AssertEqual<Result, () => number>
  })

  it('should work with setup function instead of handler', () => {
    const fn = defineRpcFunction({
      name: 'withSetup',
      args: [v.object({ id: v.string() })],
      returns: v.array(v.string()),
      setup: () => ({
        handler: (input) => {
          return [input.id]
        },
      }),
    })

    type Result = RpcFunctionDefinitionToFunction<typeof fn>
    type _Test = AssertEqual<Result, (arg_0: { id: string }) => string[]>
  })

  it('should infer types from a non-valibot Standard Schema', () => {
    const fn = defineRpcFunction({
      name: 'standardSchema',
      args: [fakeSchema<string>(), fakeSchema<number>()],
      returns: fakeSchema<boolean>(),
      handler: (a, b) => {
        return a.length > b
      },
    })

    type Result = RpcFunctionDefinitionToFunction<typeof fn>
    type _Test = AssertEqual<Result, (arg_0: string, arg_1: number) => boolean>
  })
})

describe('rpcDefinitionsToFunctions', () => {
  it('should map definitions to functions correctly', () => {
    const fn1 = defineRpcFunction({
      name: 'getUser',
      args: [v.string()],
      returns: v.object({ name: v.string() }),
      handler: id => ({ name: `User ${id}` }),
    })

    const fn2 = defineRpcFunction({
      name: 'add',
      handler: (a: number, b: number) => a + b,
    })

    const definitions = [fn1, fn2] as const

    type Result = RpcDefinitionsToFunctions<typeof definitions>
    type _Test = AssertEqual<
      Result,
      {
        getUser: (arg_0: string) => { name: string }
        add: (a: number, b: number) => number
      }
    >
  })

  it('should handle mixed definitions with and without schemas', () => {
    const withSchema = defineRpcFunction({
      name: 'withSchema',
      args: [v.boolean()],
      returns: v.string(),
      handler: flag => (flag ? 'yes' : 'no'),
    })

    const withoutSchema = defineRpcFunction({
      name: 'withoutSchema',
      handler: (items: string[]) => items.length,
    })

    const definitions = [withSchema, withoutSchema] as const

    type Result = RpcDefinitionsToFunctions<typeof definitions>
    type _Test = AssertEqual<
      Result,
      {
        withSchema: (arg_0: boolean) => string
        withoutSchema: (items: string[]) => number
      }
    >
  })
})
