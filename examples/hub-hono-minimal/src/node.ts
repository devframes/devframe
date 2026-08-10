import process from 'node:process'
import { serve } from '@hono/node-server'
import { app, hub } from './app'

const port = Number(process.env.PORT ?? 5179)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
void hub.ready.then(() => {
  // eslint-disable-next-line no-console
  console.log(`hono-devframe-hub on http://localhost:${port} — devtools at /__devframes/`)
})
