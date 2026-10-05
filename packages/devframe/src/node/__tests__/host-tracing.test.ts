import type { DevframeHost, DevframeNodeContext, DevframeRpcServerFunctions, DevframeTraceRecord, DevframeTracingChannelInfo } from 'devframe/types'
import * as diagnosticsChannel from 'node:diagnostics_channel'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRpcStreamingClientHost } from 'devframe/client'
import { DEVFRAME_EVENTS } from 'devframe/constants'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { attachWsRpcTransport } from 'devframe/rpc/transports/ws-server'
import { getPort } from 'get-port-please'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { createHostContext } from '../context'
import { RpcFunctionsHostImpl } from '../host-functions'
import { DevframeTracingHostImpl, TRACING_RECORD_BUFFER } from '../host-tracing'
import { createContextRpcServer } from '../rpc-core'

vi.stubGlobal('WebSocket', WebSocket)

const tempDirs: string[] = []
afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

function createTestHost(dir: string): DevframeHost {
  return {
    mountStatic: () => {},
    resolveOrigin: () => 'http://localhost',
    getStorageDir: scope => join(dir, scope),
  }
}

async function createCtx(): Promise<DevframeNodeContext> {
  const dir = mkdtempSync(join(tmpdir(), 'devframe-tracing-'))
  tempDirs.push(dir)
  return createHostContext({ cwd: dir, mode: 'dev', host: createTestHost(dir) })
}

async function channelsState(ctx: DevframeNodeContext): Promise<Record<string, DevframeTracingChannelInfo>> {
  const state = await ctx.rpc.sharedState.get<Record<string, DevframeTracingChannelInfo>>(DEVFRAME_EVENTS.sharedState.tracingChannels)
  await new Promise(resolve => setTimeout(resolve, 0))
  return state.value() as Record<string, DevframeTracingChannelInfo>
}

let channelSeq = 0
function uniqueName(): string {
  return `test:tracing-${process.pid}-${channelSeq++}`
}

describe('devframeTracingHost', () => {
  it('registers by name or instance, idempotently, and ranks sources', async () => {
    const ctx = await createCtx()
    const name = uniqueName()
    const channel = ctx.tracing.register(name, { description: 'first' })
    expect(channel.start).toBe(diagnosticsChannel.channel(`tracing:${name}:start`))
    expect(ctx.tracing.register(name, { description: 'ignored' })).toBe(channel)

    const instanceName = uniqueName()
    const existing = diagnosticsChannel.tracingChannel(instanceName)
    expect(ctx.tracing.register(existing)).toBe(existing)

    const configName = uniqueName()
    ctx.tracing._applyOptions({ channels: [configName, { name, description: 'ignored too' }] })
    ctx.tracing.record(uniqueName())

    const byName = Object.fromEntries(ctx.tracing.list().map(info => [info.name, info]))
    expect(byName['module.require']).toMatchObject({ source: 'builtin', recording: false, count: 0 })
    expect(byName['net.server.listen']).toMatchObject({ source: 'builtin' })
    expect(byName[name]).toMatchObject({ source: 'registered', description: 'first' })
    expect(byName[instanceName]).toMatchObject({ source: 'registered' })
    expect(byName[configName]).toMatchObject({ source: 'config' })
    expect(Object.values(byName).filter(info => info.source === 'adhoc')).toHaveLength(1)

    const state = await channelsState(ctx)
    expect(Object.keys(state).sort()).toEqual(Object.keys(byName).sort())
  })

  it('records sync and async traces as grouped records while recording', async () => {
    const ctx = await createCtx()
    const name = uniqueName()
    const channel = ctx.tracing.register(name)
    const seen: DevframeTraceRecord[] = []
    ctx.tracing.onRecord(name, record => seen.push(record))

    channel.traceSync(() => 'ignored before record', { id: 0 })
    expect(ctx.tracing.records(name)).toEqual([])

    ctx.tracing.record(name)
    expect(channel.hasSubscribers).toBe(true)

    const sync = channel.traceSync((n: number) => n * 2, { id: 1, socket: { write() {} } }, undefined, 21)
    expect(sync).toBe(42)
    const async = await channel.tracePromise(async () => 'done', { id: 2 })
    expect(async).toBe('done')
    expect(() => channel.traceSync(() => {
      throw new TypeError('boom')
    }, { id: 3 })).toThrow('boom')

    const records = ctx.tracing.records(name)
    expect(records.map(record => record.status)).toEqual(['ok', 'ok', 'error'])
    expect(records[0]).toMatchObject({ channel: name, context: { id: 1, socket: {} }, result: 42 })
    expect(records[0]!.events.map(event => event.phase)).toEqual(['start', 'end'])
    expect(records[0]!.duration).toBeGreaterThanOrEqual(0)
    expect(records[1]!.events.map(event => event.phase)).toEqual(['start', 'end', 'asyncStart', 'asyncEnd'])
    expect(records[1]).toMatchObject({ result: 'done' })
    expect(records[2]!.error).toMatchObject({ name: 'TypeError', message: 'boom' })
    expect(records[2]!.events.map(event => event.phase)).toEqual(['start', 'error', 'end'])

    // One listener call per lifecycle event, each carrying the whole record.
    expect(seen).toHaveLength(2 + 4 + 3)
    expect(seen.at(-1)).toMatchObject({ id: records[2]!.id, status: 'error' })

    ctx.tracing.stop(name)
    expect(channel.hasSubscribers).toBe(false)
    channel.traceSync(() => 'after stop', { id: 4 })
    expect(ctx.tracing.records(name)).toHaveLength(3)
    const state = await channelsState(ctx)
    expect(state[name]).toMatchObject({ recording: false, count: 3 })
    expect(state[name]!.streamId).toBeUndefined()
  })

  it('caps the buffer and clears it', async () => {
    const ctx = await createCtx()
    const name = uniqueName()
    const channel = ctx.tracing.register(name)
    ctx.tracing.record(name)
    for (let i = 0; i < TRACING_RECORD_BUFFER + 5; i++)
      channel.traceSync(() => i, { i })
    const records = ctx.tracing.records(name)
    expect(records).toHaveLength(TRACING_RECORD_BUFFER)
    expect(records[0]!.context).toEqual({ i: 5 })

    const before = (await channelsState(ctx))[name]!
    expect(before.recording).toBe(true)
    ctx.tracing.clear(name)
    expect(ctx.tracing.records(name)).toEqual([])
    const after = (await channelsState(ctx))[name]!
    expect(after.count).toBe(0)
    expect(after.recording).toBe(true)
    expect(after.streamId).not.toBe(before.streamId)
  })

  it('does not record its own wire RPC', async () => {
    const ctx = await createCtx()
    const rpcName = uniqueName()
    const channel = ctx.tracing.register(rpcName)
    ctx.tracing.record(rpcName)
    for (const method of ['devframe:tracing:record', 'devframe:tracing:stop', 'devframe:tracing:clear'] as const)
      await ctx.rpc.invokeLocal(method, uniqueName())
    expect(ctx.tracing.records(rpcName)).toEqual([])
    expect(channel.hasSubscribers).toBe(true)
  })

  it('streams records to a client, with replay on resubscribe', async () => {
    const ctx = await createCtx()
    const port = await getPort({ host: '127.0.0.1', random: true })
    const server = createContextRpcServer({ context: ctx, auth: false })
    const { close } = attachWsRpcTransport(server.rpcGroup, {
      port,
      host: '127.0.0.1',
      onConnected: server.onConnected,
      onDisconnected: server.onDisconnected,
    })

    const name = uniqueName()
    const channel = ctx.tracing.register(name)
    try {
      const client = bootClient(port)
      await client.rpc.$call('devframe:tracing:record', name)
      const streamId = (await channelsState(ctx))[name]!.streamId!
      channel.traceSync(() => 1, { n: 1 })

      const reader = client.streaming.subscribe<DevframeTraceRecord>(DEVFRAME_EVENTS.stream.tracing, streamId)
      const first = await reader[Symbol.asyncIterator]().next()
      expect(first.value).toMatchObject({ channel: name, context: { n: 1 }, status: 'pending' })
      client.close()

      // A fresh client replays the buffered chunks from the start.
      const again = bootClient(port)
      const replayed = again.streaming.subscribe<DevframeTraceRecord>(DEVFRAME_EVENTS.stream.tracing, streamId)
      const chunks: DevframeTraceRecord[] = []
      for await (const chunk of replayed) {
        chunks.push(chunk)
        if (chunks.length === 2)
          break
      }
      expect(chunks.map(chunk => chunk.status)).toEqual(['pending', 'ok'])
      again.close()
    }
    finally {
      await close()
    }
  })

  it('is a no-op that warns once where tracingChannel is missing', async () => {
    const ctx = await createCtx()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const host = new DevframeTracingHostImpl(
      { ...ctx, rpc: new RpcFunctionsHostImpl(ctx) },
      { channel: diagnosticsChannel.channel },
    )
    expect(host.supported).toBe(false)
    const name = uniqueName()
    const channel = host.register(name)
    expect(channel.traceSync(() => 'ran')).toBe('ran')
    await expect(channel.tracePromise(async () => 'ran')).resolves.toBe('ran')
    expect(channel.hasSubscribers).toBe(false)

    host.record(name)
    host.record(name)
    expect(host.list().find(info => info.name === name)).toMatchObject({ recording: false })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('DF0081')
    warn.mockRestore()
  })
})

interface FakeClient {
  rpc: ReturnType<typeof createRpcClient<DevframeRpcServerFunctions, Record<string, (...args: any[]) => any>>>
  streaming: ReturnType<typeof createRpcStreamingClientHost>
  close: () => void
}

function bootClient(port: number): FakeClient {
  const clientFns: Record<string, (...args: any[]) => any> = {}
  const rpc = createRpcClient<DevframeRpcServerFunctions, Record<string, (...args: any[]) => any>>(
    clientFns,
    { channel: createWsRpcChannel({ url: `ws://127.0.0.1:${port}` }) },
  )
  // Mimics the `DevframeRpcClient` surface `createRpcStreamingClientHost` uses.
  const fakeRpcClient = {
    isTrusted: true,
    events: { on: () => () => {} },
    client: {
      register(def: { name: string, handler: (...args: any[]) => any }) {
        clientFns[def.name] = def.handler
      },
    },
    callEvent: (name: string, ...args: any[]) => (rpc as any).$callEvent(name, ...args),
  } as any
  const streaming = createRpcStreamingClientHost(fakeRpcClient)
  return {
    rpc,
    streaming,
    close() {
      (rpc as any).$close()
    },
  }
}
