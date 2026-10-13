import type { DevframeNodeContext } from 'devframe/types'
import type { CreateContextRpcServerOptions } from '../rpc-core'
import { createRpcClient } from 'devframe/rpc/client'
import { expect, it, vi } from 'vitest'
import { RpcFunctionsHostImpl } from '../host-functions'
import { createContextRpcServer } from '../rpc-core'

// Simulate WebContainer losing AsyncLocalStorage context across awaits.
vi.mock('node:async_hooks', () => ({
  AsyncLocalStorage: class {
    store: unknown
    run(store: unknown, callback: () => unknown) {
      const previous = this.store
      this.store = store
      try {
        return callback()
      }
      finally {
        this.store = previous
      }
    }

    getStore() { return this.store }
  },
}))

function createServer(authorize?: CreateContextRpcServerOptions['authorize']) {
  const context = {} as DevframeNodeContext
  const rpc = new RpcFunctionsHostImpl(context)
  Object.assign(context, { rpc })
  const { rpcGroup } = createContextRpcServer({ context, authorize })

  // Connect real birpc peers through an in-memory channel.
  function connect(id: string) {
    let receiveServer: (data: unknown) => void
    let receiveClient: (data: unknown) => void
    rpcGroup.updateChannels((channels) => {
      channels.push({
        meta: { id },
        post: data => queueMicrotask(() => receiveClient(data)),
        on: fn => receiveServer = fn,
      })
    })
    return createRpcClient<Record<string, (...args: any[]) => any>>({}, {
      channel: {
        post: data => queueMicrotask(() => receiveServer(data)),
        on: fn => receiveClient = fn,
      },
      rpcOptions: { timeout: 1000 },
    })
  }

  return { rpc, connect }
}

it.each([false, true])('keeps concurrent sessions isolated with schema validation: %s', async (withSchema) => {
  const { rpc, connect } = createServer()
  const handler = () => rpc.getCurrentRpcSession()?.meta.id
  const setup = vi.fn(async () => ({ handler }))
  rpc.register({
    name: 'test:session',
    type: 'query',
    args: withSchema ? [{ '~standard': { version: 1, vendor: 'test', validate: async (value: unknown) => ({ value }) } }] : undefined,
    setup,
  })
  const first = connect('first')
  const second = connect('second')
  const results = await Promise.all([
    first.$call('test:session'),
    second.$call('test:session'),
  ])
  expect(results).toEqual(['first', 'second'])
  expect(rpc.getCurrentRpcSession()).toBeUndefined()
  expect(setup).toHaveBeenCalledTimes(1)
})

it('rejects unknown methods', async () => {
  const { connect } = createServer()
  await expect(connect('first').$call('test:missing')).rejects.toThrow('not found')
})

it('rejects unauthorized calls before running setup', async () => {
  const { rpc, connect } = createServer(() => false)
  const setup = vi.fn(async () => ({ handler: () => 'value' }))
  rpc.register({ name: 'test:private', type: 'query', setup })
  await expect(connect('first').$call('test:private')).rejects.toThrow('not authorized')
  expect(setup).not.toHaveBeenCalled()
})

it('returns setup errors to the caller and allows a retry', async () => {
  const { rpc, connect } = createServer()
  const setup = vi.fn()
    .mockRejectedValueOnce(new Error('setup failed'))
    .mockResolvedValue({ handler: () => 'ready' })
  rpc.register({ name: 'test:setup', type: 'query', setup })
  const client = connect('first')
  await expect(client.$call('test:setup')).rejects.toThrow('setup failed')
  await expect(client.$call('test:setup')).resolves.toBe('ready')
  expect(setup).toHaveBeenCalledTimes(2)
})
