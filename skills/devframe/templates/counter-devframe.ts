// Smallest possible devframe. The same definition serves anywhere:
//   - standard handler: initDevframe(counter, { base: '/__counter/' }).handler
//   - standalone CLI:    createCac(counter).parse()
//   - composed in a hub: initHub({ devframes: [counter], ... })
// A host derives its dock entry from `id` / `name` / `icon` automatically.
import { defineDevframe, defineRpcFunction } from 'devframe'
// Recommended: source version/packageName/homepage/description from your
// package.json so the published metadata stays in sync. The import-attribute
// form resolves under both bundlers and Node's native TypeScript execution.
import pkg from '../package.json' with { type: 'json' }

let counter = 0

export default defineDevframe({
  id: 'counter',
  name: 'Counter',
  version: pkg.version,
  packageName: pkg.name,
  // Always pass import.meta.url — the base the host resolves the tool's own
  // companion packages (assets, services) against.
  importMetaUrl: import.meta.url,
  homepage: pkg.homepage,
  description: pkg.description,
  icon: 'ph:counter-duotone',
  setup(ctx) {
    // Scoped context — auto-namespaces ids with `counter:`.
    const my = ctx.scope('counter')
    my.rpc.register(defineRpcFunction({
      name: 'get', // -> counter:get
      type: 'static',
      handler: () => ({ count: counter }),
    }))
    my.rpc.register(defineRpcFunction({
      name: 'bump', // -> counter:bump
      type: 'action',
      handler: () => ({ count: ++counter }),
    }))
  },
})
