/**
 * Bun smoke test for the fetch-upgrade WebSocket tier — run locally with:
 *
 *   bun scripts/smoke-bun.ts
 *
 * Boots the Hono example's hub under `Bun.serve` and exercises the three
 * surfaces end to end on Bun: HTTP through the catch-all handler, the
 * embedded bootstrap, and an RPC round-trip over a same-origin WebSocket
 * upgrade (no side-car port anywhere).
 *
 * Prerequisites: `pnpm install && pnpm build` (the hub serves built dists).
 */
import process from 'node:process'
import { app, hub } from '../examples/hub-hono-minimal/src/app'

function fail(step: string, detail: unknown): never {
  console.error(`✗ ${step}:`, detail)
  process.exit(1)
}

const server = Bun.serve({
  port: 0,
  fetch: app.fetch,
  websocket: hub.websocket as never,
})
await hub.ready
const origin = `http://localhost:${server.port}`
console.log(`serving on ${origin}`)

// 1. Discovery through the fetch handler — the Bun tier advertises a
// same-origin relative path (no side-car port).
const meta = await (await fetch(`${origin}/__devframes/__connection.json`)).json() as {
  backend: string
  websocket: { path?: string, port?: number }
}
if (meta.backend !== 'websocket' || !meta.websocket?.path || meta.websocket.port)
  fail('connection meta', meta)
console.log('✓ __connection.json advertises the same-origin socket:', JSON.stringify(meta.websocket))

// 2. The index document and a frame SPA.
const index = await (await fetch(`${origin}/__devframes/__index.json`)).json() as { frames: { id: string, base: string }[] }
if (!index.frames.some(frame => frame.id === 'devframes_plugin_inspect'))
  fail('__index.json', index)
console.log('✓ __index.json lists', index.frames.map(frame => frame.id).join(', '))
const frame = await fetch(`${origin}${index.frames[0]!.base}`)
if (!frame.ok)
  fail('frame SPA', frame.status)
console.log('✓ frame SPA serves:', index.frames[0]!.base, frame.status)

// 3. The embedded bootstrap from the ui slot.
const embedded = await fetch(`${origin}/__devframes/embedded.js`)
const embeddedJs = await embedded.text()
if (!embedded.ok || !embeddedJs.includes('devframes-dock-embedded'))
  fail('embedded.js', embedded.status)
console.log(`✓ embedded.js serves (${(embeddedJs.length / 1024).toFixed(0)} kB)`)

// 4. RPC round-trip over a same-origin WebSocket upgrade.
const { createRpcClient } = await import('devframe/rpc/client')
const { createWsRpcChannel } = await import('devframe/rpc/transports/ws-client')
const rpc = createRpcClient<any, any>({}, {
  channel: createWsRpcChannel({ url: `ws://localhost:${server.port}${meta.websocket.path}` }),
})
const handshake = await rpc.$call('anonymous:devframe:auth', { authToken: '', ua: 'smoke', origin }) as { isTrusted: boolean }
if (!handshake.isTrusted)
  fail('handshake', handshake)
const pong = await rpc.$call('example:hub-hono-minimal:probe')
if (pong !== 'pong')
  fail('rpc probe', pong)
console.log('✓ WS RPC round-trip over the fetch-upgrade tier: probe →', pong)
rpc.$close?.()

await hub.close()
server.stop(true)
console.log('\nBun smoke test passed.')
process.exit(0)
