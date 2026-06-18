import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'pathe'

const root = fileURLToPath(new URL('.', import.meta.url))
const r = (path: string) => fileURLToPath(new URL(`./packages/${path}`, import.meta.url))
const p = (path: string) => fileURLToPath(new URL(`./plugins/${path}`, import.meta.url))

export const alias = {
  'devframe/rpc/transports/ws-server': r('devframe/src/rpc/transports/ws-server.ts'),
  'devframe/rpc/transports/ws-client': r('devframe/src/rpc/transports/ws-client.ts'),
  'devframe/rpc/client': r('devframe/src/rpc/client.ts'),
  'devframe/rpc/dump': r('devframe/src/rpc/dump/index.ts'),
  'devframe/rpc/server': r('devframe/src/rpc/server.ts'),
  'devframe/rpc': r('devframe/src/rpc'),
  'devframe/types': r('devframe/src/types/index.ts'),
  'devframe/node/auth': r('devframe/src/node/auth/index.ts'),
  'devframe/node/hub-internals': r('devframe/src/node/hub-internals/index.ts'),
  'devframe/node': r('devframe/src/node/index.ts'),
  'devframe/constants': r('devframe/src/constants.ts'),
  'devframe/utils/colors': r('devframe/src/utils/colors.ts'),
  'devframe/utils/crypto-token': r('devframe/src/utils/crypto-token.ts'),
  'devframe/utils/events': r('devframe/src/utils/events.ts'),
  'devframe/utils/hash': r('devframe/src/utils/hash.ts'),
  'devframe/utils/launch-editor': r('devframe/src/utils/launch-editor.ts'),
  'devframe/utils/nanoid': r('devframe/src/utils/nanoid.ts'),
  'devframe/utils/open': r('devframe/src/utils/open.ts'),
  'devframe/utils/promise': r('devframe/src/utils/promise.ts'),
  'devframe/utils/scope': r('devframe/src/utils/scope.ts'),
  'devframe/utils/serve-static': r('devframe/src/utils/serve-static.ts'),
  'devframe/utils/shared-state': r('devframe/src/utils/shared-state.ts'),
  'devframe/utils/streaming-channel': r('devframe/src/utils/streaming-channel.ts'),
  'devframe/utils/structured-clone': r('devframe/src/utils/structured-clone.ts'),
  'devframe/utils/when': r('devframe/src/utils/when.ts'),
  'devframe/adapters/cli': r('devframe/src/adapters/cli.ts'),
  'devframe/adapters/dev': r('devframe/src/adapters/dev.ts'),
  'devframe/adapters/build': r('devframe/src/adapters/build.ts'),
  'devframe/helpers/vite': r('devframe/src/helpers/vite.ts'),
  'devframe/adapters/embedded': r('devframe/src/adapters/embedded.ts'),
  'devframe/adapters/mcp': r('devframe/src/adapters/mcp/index.ts'),
  '@devframes/hub/client': r('hub/src/client/index.ts'),
  '@devframes/hub/constants': r('hub/src/constants.ts'),
  '@devframes/hub/node': r('hub/src/node/index.ts'),
  '@devframes/hub/types': r('hub/src/types/index.ts'),
  '@devframes/hub': r('hub/src/index.ts'),
  '@devframes/nuxt/runtime/plugin.client': r('nuxt/src/runtime/plugin.client.ts'),
  '@devframes/nuxt': r('nuxt/src/index.ts'),
  '@devframes/plugin-code-server/client': p('code-server/src/client/index.ts'),
  '@devframes/plugin-code-server/node': p('code-server/src/node/index.ts'),
  '@devframes/plugin-code-server/constants': p('code-server/src/constants.ts'),
  '@devframes/plugin-code-server/types': p('code-server/src/types.ts'),
  '@devframes/plugin-code-server/rpc': p('code-server/src/rpc/index.ts'),
  '@devframes/plugin-code-server/cli': p('code-server/src/cli.ts'),
  '@devframes/plugin-code-server/vite': p('code-server/src/vite.ts'),
  '@devframes/plugin-code-server': p('code-server/src/index.ts'),
  '@devframes/plugin-terminals/client': p('terminals/src/client/index.ts'),
  '@devframes/plugin-terminals/node': p('terminals/src/node/index.ts'),
  '@devframes/plugin-terminals/constants': p('terminals/src/constants.ts'),
  '@devframes/plugin-terminals/types': p('terminals/src/types.ts'),
  '@devframes/plugin-terminals/cli': p('terminals/src/cli.ts'),
  '@devframes/plugin-terminals/vite': p('terminals/src/vite.ts'),
  '@devframes/plugin-terminals': p('terminals/src/index.ts'),
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
