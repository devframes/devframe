import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'pathe'

const root = fileURLToPath(new URL('.', import.meta.url))
const r = (path: string) => fileURLToPath(new URL(`./packages/${path}`, import.meta.url))

export const alias = {
  'devframe/rpc/transports/ws-server': r('devframe/src/rpc/transports/ws-server.ts'),
  'devframe/rpc/transports/ws-client': r('devframe/src/rpc/transports/ws-client.ts'),
  'devframe/rpc/client': r('devframe/src/rpc/client.ts'),
  'devframe/rpc/server': r('devframe/src/rpc/server.ts'),
  'devframe/rpc': r('devframe/src/rpc'),
  'devframe/types': r('devframe/src/types/index.ts'),
  'devframe/node/auth': r('devframe/src/node/auth/index.ts'),
  'devframe/node/internal': r('devframe/src/node/internal/index.ts'),
  'devframe/node': r('devframe/src/node/index.ts'),
  'devframe/constants': r('devframe/src/constants.ts'),
  'devframe/utils/colors': r('devframe/src/utils/colors.ts'),
  'devframe/utils/events': r('devframe/src/utils/events.ts'),
  'devframe/utils/hash': r('devframe/src/utils/hash.ts'),
  'devframe/utils/human-id': r('devframe/src/utils/human-id.ts'),
  'devframe/utils/launch-editor': r('devframe/src/utils/launch-editor.ts'),
  'devframe/utils/nanoid': r('devframe/src/utils/nanoid.ts'),
  'devframe/utils/open': r('devframe/src/utils/open.ts'),
  'devframe/utils/promise': r('devframe/src/utils/promise.ts'),
  'devframe/utils/serve-static': r('devframe/src/utils/serve-static.ts'),
  'devframe/utils/shared-state': r('devframe/src/utils/shared-state.ts'),
  'devframe/utils/streaming-channel': r('devframe/src/utils/streaming-channel.ts'),
  'devframe/utils/structured-clone': r('devframe/src/utils/structured-clone.ts'),
  'devframe/utils/when': r('devframe/src/utils/when.ts'),
  'devframe/adapters/cli': r('devframe/src/adapters/cli.ts'),
  'devframe/adapters/dev': r('devframe/src/adapters/dev.ts'),
  'devframe/adapters/build': r('devframe/src/adapters/build.ts'),
  'devframe/adapters/vite': r('devframe/src/adapters/vite.ts'),
  'devframe/adapters/embedded': r('devframe/src/adapters/embedded.ts'),
  'devframe/adapters/mcp': r('devframe/src/adapters/mcp.ts'),
  '@devframes/nuxt/runtime/plugin.client': r('nuxt/src/runtime/plugin.client.ts'),
  '@devframes/nuxt': r('nuxt/src/index.ts'),
  'devframe/recipes/open-helpers': r('devframe/src/recipes/open-helpers.ts'),
  'devframe/client': r('devframe/src/client/index.ts'),
  'devframe': r('devframe/src'),
}

// update tsconfig.base.json
const raw = fs.readFileSync(join(root, 'tsconfig.base.json'), 'utf-8').trim()
const tsconfig = JSON.parse(raw)
tsconfig.compilerOptions.paths = Object.fromEntries(
  Object.entries(alias).map(([key, value]) => [key, [`./${relative(root, value)}`]]),
)
const newRaw = JSON.stringify(tsconfig, null, 2)
if (newRaw !== raw)
  fs.writeFileSync(join(root, 'tsconfig.base.json'), `${newRaw}\n`, 'utf-8')
