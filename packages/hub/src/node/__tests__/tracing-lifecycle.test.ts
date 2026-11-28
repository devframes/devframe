import type { DevframeNodeContext } from 'devframe/types'
import { tracingChannel } from 'node:diagnostics_channel'
import { initHub } from '@devframes/hub/initiate'
import { DEVFRAME_EVENTS } from 'devframe/constants'
import { initDevframe } from 'devframe/initiate'
import { createTracingRecorder } from 'devframe/node'
import { describe, expect, it, vi } from 'vitest'

const options = { base: '/tracing/', mcp: false, register: false } as const
type Setup = (ctx: DevframeNodeContext) => void
const instances = [
  {
    kind: 'devframe',
    start: (setup: Setup) => initDevframe({
      id: 'tracing',
      name: 'Tracing',
      packageName: 'test-tracing',
      version: '0.0.0',
      homepage: '',
      description: '',
      setup,
    }, options),
  },
  {
    kind: 'hub',
    start: (setup: Setup) => initHub({ ...options, configure: setup }),
  },
]

describe.each(instances)('$kind tracing', ({ kind, start }) => {
  it('closes its streams and subscriptions while an attached tool keeps recording', async () => {
    const name = `test:owned-tracing:${kind}`
    const app = start(ctx => ctx.scope('child').tracing.record(name))
    const ctx = await app.context
    const tool = createTracingRecorder()
    const channel = tool.register(name)
    tool.record(name)
    const detach = ctx.tracing.attach(tool)
    const onRecord = vi.fn()
    ctx.tracing.onRecord(name, onRecord)
    const streamId = ctx.tracing.list().find(info => info.name === name)!.streamId
    const broadcast = vi.spyOn(ctx.rpc, 'broadcast')

    vi.useFakeTimers()
    try {
      channel.traceSync(() => 1)
      expect(vi.getTimerCount()).toBe(1)
      onRecord.mockClear()

      await app.close()
      expect(vi.getTimerCount()).toBe(0)
      expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({
        method: DEVFRAME_EVENTS.broadcast.streamingEnd,
        args: [DEVFRAME_EVENTS.stream.tracing, streamId, undefined],
      }))
      channel.traceSync(() => 2)
      expect(tool.records(name).map(record => record.result)).toEqual([1, 2])
      expect(ctx.tracing.records(name).map(record => record.result)).toEqual([1])
      expect(onRecord).not.toHaveBeenCalled()
    }
    finally {
      vi.useRealTimers()
      detach()
      tool.stop(name)
      await app.close()
    }
    expect(channel.hasSubscribers).toBe(false)
  })

  it('releases tracing before setup rejection and preserves the setup error', async () => {
    const name = `test:failed-tracing:${kind}`
    const channel = tracingChannel(name)
    const setupError = new Error('setup failed')
    const unsubscribe = vi.fn().mockImplementationOnce(() => {
      throw new Error('detach failed')
    })
    const app = start((ctx) => {
      ctx.tracing.record(name)
      ctx.tracing.attach({
        list: () => [],
        records: () => [],
        subscribe: () => unsubscribe,
      })
      throw setupError
    })
    await expect(app.ready).rejects.toBe(setupError)
    expect(channel.hasSubscribers).toBe(false)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    await app.close()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })
})

it('keeps tracing on a caller-supplied hub context through close and failed setup', async () => {
  const owner = initHub(options)
  const context = await owner.context
  const name = 'test:borrowed-tracing'
  const channel = context.tracing.register(name)
  context.tracing.record(name)
  try {
    const borrower = initHub({ ...options, context })
    await borrower.ready
    await borrower.close()

    const setupError = new Error('borrower setup failed')
    const failed = initHub({
      ...options,
      context,
      configure: () => { throw setupError },
    })
    await expect(failed.ready).rejects.toBe(setupError)
    await failed.close()

    channel.traceSync(() => 3)
    expect(context.tracing.records(name).map(record => record.result)).toEqual([3])
  }
  finally {
    await owner.close()
  }
  expect(channel.hasSubscribers).toBe(false)
})

it('publishes stopped channels to a borrowing hub when the owner closes first', async () => {
  const owner = initHub(options)
  const context = await owner.context
  const borrower = initHub({ ...options, context })
  const name = 'test:owner-closes-first'
  try {
    const { rpc } = await borrower.context
    const readChannels = () => rpc.invokeLocal('devframe:rpc:server-state:get', DEVFRAME_EVENTS.sharedState.tracingChannels)
    const channel = context.tracing.register(name)
    context.tracing.record(name)
    channel.traceSync(() => 1)
    expect((await readChannels())[name]).toMatchObject({
      recording: true,
      streamId: expect.any(String),
    })

    await owner.close()
    const stopped = (await readChannels())[name]
    expect(stopped).toMatchObject({ recording: false, count: 1 })
    expect(stopped.streamId).toBeUndefined()

    await rpc.invokeLocal('devframe:tracing:clear', name)
    expect((await readChannels())[name].count).toBe(0)
  }
  finally {
    await borrower.close()
    await owner.close()
  }
})
