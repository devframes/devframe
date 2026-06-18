// Smallest possible devframe. The dock entry is auto-derived from
// `id` / `name` / `icon` when this definition is mounted into Vite
// DevTools via `createPluginFromDevframe(devframe)`.
import { defineDevframe, defineRpcFunction } from 'devframe'

let counter = 0

export default defineDevframe({
  id: 'counter',
  name: 'Counter',
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
