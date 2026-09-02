/* eslint-disable no-console */
import type { DevframeDefinition } from 'devframe/types'
import { createServer } from 'node:http'
import process from 'node:process'
import { initDevframe } from 'devframe/initiate'
import { createRpcClient } from 'devframe/rpc/client'
import { createSseRpcChannel } from 'devframe/rpc/transports/sse-client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'

/**
 * Cross-runtime smoke test for the RPC transport binding — the regression
 * guard for issue #317, where `instance-shell` always loaded crossws's Node
 * adapter and crashed the WebSocket transport on Bun/Deno.
 *
 * It boots real `initDevframe` instances under whatever runtime executes it
 * (Node, Bun, or Deno) and drives one RPC round-trip through each binding:
 *
 *  - a **side-car** instance, where devframe owns a dedicated server — a real
 *    native WebSocket on Bun/Deno (crossws's Bun/Deno adapter over
 *    `Bun.serve` / `Deno.serve`), the Node adapter on Node;
 *  - a **shared-server** instance, where a foreign `node:http` server is
 *    handed in — a native WebSocket on Node, and the SSE fallback on Bun/Deno
 *    (which can't re-host a foreign `node:http` server natively).
 *
 * Run it with `bun tests/runtime/smoke.ts`, `deno run -A --node-modules-dir
 * tests/runtime/smoke.ts`, or `tsx tests/runtime/smoke.ts`. The package must be
 * built first — it imports the published `devframe/*` entry points.
 */

type Runtime = 'node' | 'bun' | 'deno'

function detectRuntime(): Runtime {
  const g = globalThis as { Deno?: unknown, Bun?: unknown }
  if (typeof g.Deno !== 'undefined')
    return 'deno'
  if (typeof g.Bun !== 'undefined')
    return 'bun'
  return 'node'
}

function defineSmokeDefinition(): DevframeDefinition {
  return {
    id: 'runtime-smoke',
    name: 'Runtime Smoke',
    version: '0.0.0',
    packageName: 'runtime-smoke',
    homepage: 'https://example.test',
    description: 'Cross-runtime RPC transport smoke test.',
    setup(ctx) {
      ctx.rpc.register({
        name: 'runtime-smoke:ping',
        type: 'query',
        jsonSerializable: true,
        handler: () => 'pong',
      })
    },
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition)
    throw new Error(message)
}

/** The side-car binding: a real native WebSocket on Bun/Deno, Node adapter on Node. */
async function checkSidecar(runtime: Runtime): Promise<void> {
  const instance = initDevframe(defineSmokeDefinition(), {
    base: '/',
    auth: false,
    host: '127.0.0.1',
    ws: { sidecar: true },
    register: false,
  })
  try {
    await instance.ready
    const meta = instance.connectionMeta()
    assert(meta.backend === 'websocket', `side-car backend should be websocket, got "${meta.backend}"`)
    const ws = meta.websocket
    assert(ws && typeof ws === 'object' && 'port' in ws && ws.port, 'side-car meta should advertise a port')
    const url = `ws://127.0.0.1:${(ws as { port: number }).port}/__ws`

    const channel = createWsRpcChannel({ url })
    const client = createRpcClient<{ 'runtime-smoke:ping': () => string }, Record<string, never>>({}, { channel })
    try {
      const result = await (client as { $call: (name: string) => Promise<unknown> }).$call('runtime-smoke:ping')
      assert(result === 'pong', `side-car RPC round-trip should return "pong", got ${JSON.stringify(result)}`)
    }
    finally {
      channel.close()
    }
    console.log(`  ✓ side-car: native WebSocket round-trip (${runtime})`)
  }
  finally {
    await instance.close()
  }
}

/** The shared-server binding: native WebSocket on Node, SSE fallback on Bun/Deno. */
async function checkSharedServer(runtime: Runtime): Promise<void> {
  // A foreign `node:http` server selects the `server` tier. On Bun/Deno the
  // transport falls back to SSE (mounted on the shell's own app), so the
  // server itself never has to listen — the SSE round-trip below rides
  // `instance.handler` directly.
  const server = createServer()
  const instance = initDevframe(defineSmokeDefinition(), {
    base: '/',
    auth: false,
    host: '127.0.0.1',
    server,
    register: false,
  })
  try {
    await instance.ready
    const meta = instance.connectionMeta()
    const expected = runtime === 'node' ? 'websocket' : 'sse'
    assert(
      meta.backend === expected,
      `shared-server backend on ${runtime} should be "${expected}", got "${meta.backend}"`,
    )
    assert(
      meta.sse && (typeof meta.sse === 'string' || Boolean(meta.sse.path)),
      'shared-server meta should always advertise an SSE endpoint',
    )

    const channel = createSseRpcChannel({
      url: 'http://127.0.0.1/__sse',
      fetch: (input, init) => instance.handler(new Request(input as string, init as RequestInit)),
    })
    const client = createRpcClient<{ 'runtime-smoke:ping': () => string }, Record<string, never>>({}, { channel })
    try {
      const result = await (client as { $call: (name: string) => Promise<unknown> }).$call('runtime-smoke:ping')
      assert(result === 'pong', `shared-server SSE round-trip should return "pong", got ${JSON.stringify(result)}`)
    }
    finally {
      channel.close()
    }
    console.log(`  ✓ shared-server: ${expected.toUpperCase()} round-trip (${runtime})`)
  }
  finally {
    await instance.close()
    server.close()
  }
}

async function main(): Promise<void> {
  const runtime = detectRuntime()
  console.log(`devframe RPC transport smoke test — runtime: ${runtime}`)
  await checkSidecar(runtime)
  await checkSharedServer(runtime)
  console.log('all runtime smoke checks passed')
}

main().catch((error) => {
  console.error('runtime smoke test failed:')
  console.error(error)
  process.exit(1)
})
