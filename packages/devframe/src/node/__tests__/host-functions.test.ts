import type { DevframeNodeContext } from 'devframe/types'
import type { RpcFunctionsHost } from '../host-functions'
import { defineRpcFunction } from 'devframe'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { RpcFunctionsHostImpl } from '../host-functions'

async function emptyHandler() { /* empty */ }
const returnFirst = async () => 'first'
const returnSecond = async () => 'second'
const returnV1 = async () => 'v1'
const returnV2 = async () => 'v2'
const setupWith = <T>(handler: () => Promise<T>) => async () => ({ handler })

describe('rpcFunctionsHost', () => {
  const mockContext = {} as DevframeNodeContext

  describe('register() collision detection', () => {
    it('should register a new RPC function successfully', () => {
      const host = new RpcFunctionsHostImpl(mockContext)
      const fn = defineRpcFunction({
        name: 'test-function',
        type: 'action',
        setup: setupWith(emptyHandler),
      })

      expect(() => host.register(fn)).not.toThrow()
      expect(host.definitions.has('test-function')).toBe(true)
    })

    it('should throw error when registering duplicate RPC function ID', () => {
      const host = new RpcFunctionsHostImpl(mockContext)
      const fn1 = defineRpcFunction({
        name: 'duplicate-fn',
        type: 'action',
        setup: setupWith(returnFirst),
      })
      const fn2 = defineRpcFunction({
        name: 'duplicate-fn',
        type: 'action',
        setup: setupWith(returnSecond),
      })

      host.register(fn1)

      const registerDuplicate = () => host.register(fn2)
      expect(registerDuplicate).toThrow()
      expect(registerDuplicate).toThrow('duplicate-fn')
      expect(registerDuplicate).toThrow('already registered')
    })

    it('should include the duplicate ID in error message', () => {
      const host = new RpcFunctionsHostImpl(mockContext)
      const fn = defineRpcFunction({
        name: 'my-special-function',
        type: 'query',
        setup: setupWith(emptyHandler),
      })

      host.register(fn)

      const registerAgain = () => host.register(fn)
      expect(registerAgain).toThrow('my-special-function')
    })
  })

  describe('update() existence validation', () => {
    it('should throw error when updating non-existent RPC function', () => {
      const host = new RpcFunctionsHostImpl(mockContext)
      const fn = defineRpcFunction({
        name: 'nonexistent',
        type: 'action',
        setup: setupWith(emptyHandler),
      })

      const updateNonexistent = () => host.update(fn)
      expect(updateNonexistent).toThrow()
      expect(updateNonexistent).toThrow('nonexistent')
      expect(updateNonexistent).toThrow('not registered')
      expect(updateNonexistent).toThrow('Use register()')
    })

    it('should update existing RPC function successfully', () => {
      const host = new RpcFunctionsHostImpl(mockContext)
      const fn1 = defineRpcFunction({
        name: 'update-test',
        type: 'action',
        setup: setupWith(returnV1),
      })
      const fn2 = defineRpcFunction({
        name: 'update-test',
        type: 'action',
        setup: setupWith(returnV2),
      })

      host.register(fn1)
      const doUpdate = () => host.update(fn2)
      expect(doUpdate).not.toThrow()

      const updated = host.definitions.get('update-test')
      expect(updated).toBe(fn2)
    })

    it('should validate that update only works on existing entries', () => {
      const host = new RpcFunctionsHostImpl(mockContext)

      // Register one function
      host.register(defineRpcFunction({
        name: 'exists',
        type: 'action',
        setup: setupWith(emptyHandler),
      }))

      // Update should work for existing
      const updateExisting = () =>
        host.update({
          name: 'exists',
          type: 'action',
          setup: setupWith(emptyHandler),
        })
      expect(updateExisting).not.toThrow()

      // Update should fail for non-existing
      const updateMissing = () =>
        host.update({
          name: 'does-not-exist',
          type: 'action',
          setup: setupWith(emptyHandler),
        })
      expect(updateMissing).toThrow()
    })
  })

  describe('broadcast() without rpc group', () => {
    it('should not throw in build mode', async () => {
      const host = new RpcFunctionsHostImpl({ mode: 'build' } as DevframeNodeContext)
      await expect(host.broadcast({
        method: 'devframe:auth:revoked',
        args: [],
      })).resolves.toBeUndefined()
    })

    it('should not throw in dev mode when rpc group is not yet set', async () => {
      const host = new RpcFunctionsHostImpl({ mode: 'dev' } as DevframeNodeContext)
      await expect(host.broadcast({
        method: 'devframe:auth:revoked',
        args: [],
      })).resolves.toBeUndefined()
    })
  })

  describe('invokeLocal()', () => {
    it('should invoke a locally registered function', async () => {
      const host = new RpcFunctionsHostImpl(mockContext)
      host.register(defineRpcFunction({
        name: 'test:invoke-local',
        type: 'query',
        setup: () => ({
          handler: async (a: number, b: number) => a + b,
        }),
      }))

      await expect(host.invokeLocal('test:invoke-local' as any, 2, 3)).resolves.toBe(5)
    })

    it('should throw when invoking a missing local function', async () => {
      const host = new RpcFunctionsHostImpl(mockContext)
      await expect(host.invokeLocal('test:missing' as any)).rejects.toThrow('RPC function "test:missing" is not registered')
    })
  })

  describe('public RpcFunctionsHost type', () => {
    it('is the structural type that ctx.rpc satisfies', () => {
      // The `RpcFunctionsHost` exported from `devframe/node` (this
      // re-export) must be the exact same structural type as
      // `DevframeNodeContext['rpc']`, so consumers can cast `ctx.rpc`
      // to it without a TS2352 conversion error.
      expectTypeOf<DevframeNodeContext['rpc']>().toEqualTypeOf<RpcFunctionsHost>()
      expectTypeOf<DevframeNodeContext['rpc']>().toMatchTypeOf<RpcFunctionsHost>()
    })

    it('does not carry the impl-only @internal members', () => {
      const rpc = {} as RpcFunctionsHost
      // @ts-expect-error `_rpcGroup` is impl-only and must stay off the public type
      void rpc._rpcGroup
      // @ts-expect-error `_asyncStorage` is impl-only and must stay off the public type
      void rpc._asyncStorage
      // @ts-expect-error `_emitSessionDisconnected` is impl-only and must stay off the public type
      void rpc._emitSessionDisconnected
    })
  })
})
