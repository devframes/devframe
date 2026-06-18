import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import { NAMESPACE, serverFunctions } from './rpc/index.ts'

const BASE_PATH = '/__devframe-files-inspector/'
const distDir = fileURLToPath(new URL('../dist/client', import.meta.url))

export default defineDevframe({
  id: 'devframe-files-inspector',
  name: 'Files Inspector',
  icon: 'ph:folder-open-duotone',
  basePath: BASE_PATH,
  cli: {
    command: 'devframe-files-inspector',
    port: 9876,
    distDir,
  },
  spa: { loader: 'none' },
  setup(ctx) {
    // A scoped context auto-namespaces every registered id with `NAMESPACE:`.
    const my = ctx.scope(NAMESPACE)
    for (const fn of serverFunctions)
      my.rpc.register(fn)
  },
})
