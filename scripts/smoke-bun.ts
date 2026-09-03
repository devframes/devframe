/**
 * Bun smoke test for the Hono hub example, run locally with:
 *
 *   bun scripts/smoke-bun.ts
 *
 * Boots `examples/hub-hono-minimal/src/bun.ts` (Bun's fetch-upgrade wiring
 * over the hub's context) and exercises four surfaces end to end: HTTP through
 * the catch-all handler, the discovery documents, the embedded bootstrap, and
 * an RPC round-trip over a same-origin WebSocket upgrade, with no side-car port
 * anywhere.
 *
 * Prerequisites: `pnpm install && pnpm build` (the hub serves built dists).
 */
import process from 'node:process'
import { startBunServer } from '../examples/hub-hono-minimal/src/bun'

function fail(step: string, detail: unknown): never {
  console.error(`✗ ${step}:`, detail)
  process.exit(1)
}

const server = await startBunServer(0)
const origin = `http://localhost:${server.port}`
console.log(`serving on ${origin}`)

// 1. Discovery through the fetch handler: the socket rides the app's own
// origin, so the meta advertises a base-absolute path and no port.
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

// 4. RPC round-trip over the fetch upgrade.
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

await server.close()
console.log('\nBun smoke test passed.')
process.exit(0)
