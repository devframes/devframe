import process from 'node:process'
import { app, hub } from './app'

// Bun tier: WebSocket upgrades complete through `hub.handler(request,
// server)` on the app's own origin — no side-car port. `Bun.serve` needs
// the instance's `websocket` handlers wired alongside the fetch handler.
const port = Number(process.env.PORT ?? 5179)

export default {
  port,
  fetch: app.fetch,
  websocket: hub.websocket,
}

void hub.ready.then(() => {
  // eslint-disable-next-line no-console
  console.log(`hono-devframe-hub (bun) on http://localhost:${port} — devtools at /__devframes/`)
})
