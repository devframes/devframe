import { defineHandler } from 'nitro'
import { hub } from '../../hub'

// The whole hub namespace behind one catch-all route: web-standard Request
// in, Response out (h3 v2 events carry the Request on `event.req`).
// Everything — frame SPAs, __connection.json, __index.json, embedded.js,
// __client-imports.js — flows through here.
export default defineHandler(event => hub.handler(event.req))
