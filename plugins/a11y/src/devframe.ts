import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import { serverFunctions } from './rpc/index.ts'

const BASE_PATH = '/__devframe-a11y-inspector/'
const distDir = fileURLToPath(new URL('../dist/client', import.meta.url))

export default defineDevframe({
  id: 'devframe-a11y-inspector',
  name: 'A11y Inspector',
  icon: 'ph:wheelchair-duotone',
  basePath: BASE_PATH,
  cli: {
    command: 'devframe-a11y-inspector',
    port: 9899,
    distDir,
  },
  spa: { loader: 'none' },
  setup(ctx) {
    for (const fn of serverFunctions)
      ctx.rpc.register(fn)
  },
})
