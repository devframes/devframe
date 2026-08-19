import type { RequestHandler } from '@sveltejs/kit'
import { hub } from '../../../hub'

// Serve both `/__devframes/foo` and `/__devframes/foo/` verbatim. SvelteKit
// defaults to `trailingSlash: 'never'`, which would 308-redirect the hub's
// trailing-slash URLs (the standalone viewer at `/__devframes/` and each
// frame SPA at `/__devframes/<id>/`) and break the SPAs' relative asset
// resolution — the hub owns the exact paths, so opt its routes out.
export const trailingSlash = 'ignore'

// The whole hub namespace behind one catch-all route: web-standard Request
// in, Response out. `fallback` answers every method, and the `[...path]` rest
// param matches the namespace root (`/__devframes/`) as well as everything
// beneath it. Frame SPAs, __connection.json, __index.json, embedded.js,
// __client-imports.js — all flow through here.
export const fallback: RequestHandler = ({ request }) => hub.handler(request)
