import type { StartedServer } from 'devframe/node'
import type { DevframeNodeContext } from 'devframe/types'
import type { TerminalsOptions } from '../src/types'
import process from 'node:process'
import { createRpcStreamingClientHost } from 'devframe/client'
import {
  createH3DevframeHost,
  createHostContext,
  startHttpAndWs,
} from 'devframe/node'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { createEventEmitter } from 'devframe/utils/events'
import { getPort } from 'get-port-please'
import { H3 } from 'h3'
import { createTerminalsDevframe } from '../src/index'
import { getTerminalManager } from '../src/node/index'

export type TerminalsServer = StartedServer & {
  ctx: DevframeNodeContext
  port: number
}

interface FakeHubEntry {
  id: string
  title: string
  description?: string
  status: 'running' | 'stopped' | 'error'
  icon?: string | { light: string, dark: string }
}

export interface FakeHubTerminals {
  sessions: Map<string, FakeHubEntry>
  events: ReturnType<typeof createEventEmitter>
  register: (entry: FakeHubEntry) => FakeHubEntry
  update: (patch: { id: string } & Partial<FakeHubEntry>) => void
  remove: (entry: { id: string }) => void
}

/**
 * Minimal stand-in for the hub's `ctx.terminals` aggregation host — a sessions
 * map plus a `terminal:session:updated` emitter — so tests can exercise how the
 * terminals plugin surfaces sessions contributed by *other* devframes.
 */
export function createFakeHubTerminals(): FakeHubTerminals {
  const sessions = new Map<string, FakeHubEntry>()
  const events = createEventEmitter()
  return {
    sessions,
    events,
    register(entry) {
      sessions.set(entry.id, entry)
      events.emit('terminal:session:updated', entry)
      return entry
    },
    update(patch) {
      const cur = sessions.get(patch.id)
      if (cur)
        Object.assign(cur, patch)
      events.emit('terminal:session:updated', sessions.get(patch.id) ?? patch)
    },
    remove(entry) {
      const cur = sessions.get(entry.id)
      sessions.delete(entry.id)
      events.emit('terminal:session:updated', cur ?? entry)
    },
  }
}

/**
 * Boot the terminals devframe in-process over real HTTP + WebSocket so the
 * full RPC + streaming path is exercised end to end. Pass `hub` to attach a
 * fake `ctx.terminals` before setup (as a hub mount would).
 */
export async function startTerminalsServer(
  options: TerminalsOptions = {},
  { hub }: { hub?: FakeHubTerminals } = {},
): Promise<TerminalsServer> {
  const definition = createTerminalsDevframe({ allowArbitraryCommands: true, ...options })
  const host = '127.0.0.1'
  const port = await getPort({ host, random: true })

  const app = new H3()
  const origin = `http://${host}:${port}`
  const h3Host = createH3DevframeHost({
    origin,
    appName: definition.id,
    mount: () => {},
  })

  const ctx = await createHostContext({ cwd: process.cwd(), mode: 'dev', host: h3Host })
  if (hub)
    (ctx as { terminals?: FakeHubTerminals }).terminals = hub
  await definition.setup(ctx)

  const server = await startHttpAndWs({ context: ctx, host, port, app, auth: false })

  // Tear down spawned terminal processes (PTYs / piped children) alongside
  // the HTTP+WS server so tests don't leak `node`/shell processes.
  const closeServer = server.close.bind(server)
  server.close = async () => {
    try {
      getTerminalManager(ctx).dispose()
    }
    catch {
      // Manager may not be initialised if setup failed.
    }
    await closeServer()
  }

  return Object.assign(server, { ctx, port })
}

export interface TestClient {
  rpc: ReturnType<typeof createRpcClient>
  streaming: ReturnType<typeof createRpcStreamingClientHost>
}

/**
 * Minimal RPC + streaming client over the WS transport — mirrors the
 * streaming-chat example harness. `connectDevframe` is skipped because it
 * needs a browser-like environment for connection-meta lookup.
 */
export function bootClient(port: number): TestClient {
  const listeners = new Set<(trusted: boolean) => void>()
  const fakeEvents = {
    on(name: string, fn: (trusted: boolean) => void) {
      if (name === 'rpc:is-trusted:updated')
        listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
  const clientFns: any = {}
  const clientRpcStub = {
    register(def: { name: string, handler: (...args: any[]) => any }) {
      clientFns[def.name] = def.handler
    },
  }

  const rpc = createRpcClient<any, any>(clientFns, {
    channel: createWsRpcChannel({ url: `ws://127.0.0.1:${port}` }),
  })

  const fakeRpcClient = {
    isTrusted: true,
    events: fakeEvents,
    client: clientRpcStub,
    callEvent: (name: any, ...args: any[]) => (rpc as any).$callEvent(name, ...args),
  } as any

  const streaming = createRpcStreamingClientHost(fakeRpcClient)
  return { rpc, streaming }
}

export function call<T = any>(client: TestClient, method: string, ...args: any[]): Promise<T> {
  return (client.rpc as any).$call(method, ...args) as Promise<T>
}

/**
 * Terminal streams stay open for the session's whole life, so we can't drain
 * to completion. Collect output until `predicate(accumulated)` is satisfied
 * or the timeout elapses, then cancel.
 */
export async function collectUntil(
  reader: AsyncIterable<string> & { cancel: () => void },
  predicate: (acc: string) => boolean,
  timeoutMs = 4000,
): Promise<string> {
  let acc = ''
  const deadline = Date.now() + timeoutMs
  const iterator = (reader as any)[Symbol.asyncIterator]() as AsyncIterator<string>

  while (Date.now() < deadline) {
    const next = iterator.next()
    const timer = new Promise<{ timeout: true }>(resolve =>
      setTimeout(resolve, Math.max(0, deadline - Date.now()), { timeout: true }))
    const result = await Promise.race([next, timer])
    if ((result as any).timeout)
      break
    const { value, done } = result as IteratorResult<string>
    if (done)
      break
    acc += value
    if (predicate(acc))
      break
  }
  reader.cancel()
  return acc
}
