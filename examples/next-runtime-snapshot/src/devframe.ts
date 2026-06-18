import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import { NAMESPACE, serverFunctions } from './rpc/index.ts'

export type { EnvEntry, EnvSnapshot } from './rpc/functions/env.ts'
export type { MemorySnapshot } from './rpc/functions/memory.ts'
export type { SystemInfo } from './rpc/functions/system.ts'

const BASE_PATH = '/__next-runtime-snapshot/'
const distDir = fileURLToPath(new URL('../dist/client', import.meta.url))

export default defineDevframe({
  id: 'next-runtime-snapshot',
  name: 'Next Runtime Snapshot',
  icon: 'ph:gauge-duotone',
  basePath: BASE_PATH,
  cli: {
    command: 'next-runtime-snapshot',
    port: 9899,
    distDir,
    auth: false,
  },
  spa: { loader: 'none' },
  setup(ctx) {
    // A scoped context auto-namespaces every registered id with `NAMESPACE:`.
    const my = ctx.scope(NAMESPACE)
    for (const fn of serverFunctions)
      my.rpc.register(fn)
  },
})
