// Smallest possible devframe. The dock entry is auto-derived from
// `id` / `name` / `icon` when this definition is mounted into Vite
// DevTools via `createPluginFromDevframe(devframe)`.
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
  homepage: pkg.homepage,
  description: pkg.description,
  icon: 'ph:counter-duotone',
  setup(ctx) {
    ctx.rpc.register(defineRpcFunction({
      name: 'counter:get',
      type: 'static',
      handler: () => ({ count: counter }),
    }))
    ctx.rpc.register(defineRpcFunction({
      name: 'counter:bump',
      type: 'action',
      handler: () => ({ count: ++counter }),
    }))
  },
})
