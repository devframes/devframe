// Devframe with setupBrowser + SPA query-loader — deployable as a static site.
// Host adapters (e.g. the `vite` adapter for Vite DevTools) auto-derive their
// mount entry from `id` / `name` / `icon`.
import { defineDevframe, defineRpcFunction } from 'devframe'
// Recommended: source version/packageName/homepage/description from your
// package.json so the published metadata stays in sync. The import-attribute
// form resolves under both bundlers and Node's native TypeScript execution.
import pkg from '../package.json' with { type: 'json' }
import * as v from 'valibot'

export default defineDevframe({
  id: 'my-inspector',
  name: 'My Inspector',
  version: pkg.version,
  packageName: pkg.name,
  homepage: pkg.homepage,
  description: pkg.description,
  icon: 'ph:magnifying-glass-duotone',
  setup(ctx) {
    const my = ctx.scope('my-inspector')
    my.rpc.register(defineRpcFunction({
      name: 'analyze', // -> my-inspector:analyze
      type: 'query',
      args: [v.object({ url: v.string() })],
      returns: v.object({ url: v.string(), verdict: v.literal('ok') }),
      handler: ({ url }: { url: string }) => {
        // Server-side implementation (used by CLI/build adapters).
        return { url, verdict: 'ok' as const }
      },
    }))
  },
  setupBrowser() {
    // Browser-side implementation — used by the SPA adapter so the
    // deployed static site can answer RPC without a server.
    // (Wire up an in-browser handler here once the SPA adapter lands.)
  },
  spa: { loader: 'query' },
})
