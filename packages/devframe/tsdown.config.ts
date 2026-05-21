import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(here, 'dist')

const tsconfig = '../../tsconfig.base.json'

const deps = {
  // Keep transitive external type graphs out of dts bundling.
  // `vite`/`esbuild`/`postcss` are pulled in via the kit client's
  // `declare module 'vite'` augmentation and contain
  // rolldown-incompatible re-exports that would otherwise fail dts
  // generation with dozens of MISSING_EXPORT errors.
  neverBundle: [
    'vite',
    'esbuild',
    'postcss',
    'rolldown',
    /^@rolldown\//,
    /^@oxc-project\//,
    'terser',
    '@jridgewell/trace-mapping',
  ],
  onlyBundle: [
    'acorn',
    'bundle-name',
    'default-browser',
    'default-browser-id',
    'define-lazy-prop',
    'get-port-please',
    'immer',
    'is-docker',
    'is-in-ssh',
    'is-inside-container',
    'is-wsl',
    'launch-editor',
    'mlly',
    'obug',
    'ohash',
    'open',
    'p-limit',
    'perfect-debounce',
    'picocolors',
    'powershell-utils',
    'run-applescript',
    'shell-quote',
    'structured-clone-es',
    'tinyexec',
    'ua-parser-modern',
    'whenexpr',
    'wsl-utils',
    'yocto-queue',
  ],
}

// Shared by the runtime client build and the combined dts build below.
const clientEntries = {
  'client/index': 'src/client/index.ts',
  'utils/colors': 'src/utils/colors.ts',
  'utils/events': 'src/utils/events.ts',
  'utils/hash': 'src/utils/hash.ts',
  'utils/human-id': 'src/utils/human-id.ts',
  'utils/nanoid': 'src/utils/nanoid.ts',
  'utils/promise': 'src/utils/promise.ts',
  'utils/shared-state': 'src/utils/shared-state.ts',
  'utils/streaming-channel': 'src/utils/streaming-channel.ts',
  'utils/structured-clone': 'src/utils/structured-clone.ts',
  'utils/when': 'src/utils/when.ts',
}

// Shared by the runtime server build and the combined dts build below.
const serverEntries = {
  'index': 'src/index.ts',
  'constants': 'src/constants.ts',
  'types/index': 'src/types/index.ts',
  'rpc/index': 'src/rpc/index.ts',
  'rpc/client': 'src/rpc/client.ts',
  'rpc/dump': 'src/rpc/dump/index.ts',
  'rpc/server': 'src/rpc/server.ts',
  'rpc/transports/ws-client': 'src/rpc/transports/ws-client.ts',
  'rpc/transports/ws-server': 'src/rpc/transports/ws-server.ts',
  'node/index': 'src/node/index.ts',
  'node/auth': 'src/node/auth/index.ts',
  'node/internal': 'src/node/internal/index.ts',
  'utils/launch-editor': 'src/utils/launch-editor.ts',
  'utils/open': 'src/utils/open.ts',
  'utils/serve-static': 'src/utils/serve-static.ts',
  'adapters/cli': 'src/adapters/cli.ts',
  'adapters/dev': 'src/adapters/dev.ts',
  'adapters/build': 'src/adapters/build.ts',
  'adapters/embedded': 'src/adapters/embedded.ts',
  'adapters/mcp': 'src/adapters/mcp/index.ts',
  'helpers/vite': 'src/helpers/vite.ts',
  'recipes/open-helpers': 'src/recipes/open-helpers.ts',
}

// Three configs:
//
// 1. Runtime client/agnostic build (`dts: false`). Independent rolldown
//    chunk graph so server-only imports like `devframe/rpc/transports/ws-server`
//    or `node:crypto` can't leak into browser-loaded outputs
//    (`client/index.mjs`, `utils/hash.mjs`, …). `clean: true` clears
//    dist/ before the server build appends.
// 2. Runtime server/node build (`dts: false`). `clean: false` appends to
//    the client output.
// 3. Combined dts build (`emitDtsOnly: true`). All entries live in a
//    single rolldown graph so shared modules — notably
//    `src/types/rpc-augments.ts` — produce exactly one declaration site.
//    This is what lets consumer `declare module 'devframe'` augmentations
//    propagate across every import chain.
export default defineConfig([
  {
    clean: true,
    platform: 'browser',
    tsconfig,
    deps,
    dts: false,
    // `platform: 'browser'` defaults to `.js`; force `.mjs` to match the
    // `packages/devframe/package.json` `exports` map.
    outExtensions: () => ({ js: '.mjs' }),
    entry: clientEntries,
    hooks: {
      'build:done': async () => {
        const { checkClientDist } = await import('./scripts/check-client-dist.ts')
        await checkClientDist({
          entries: [
            resolve(distDir, 'client/index.mjs'),
            resolve(distDir, 'utils/colors.mjs'),
            resolve(distDir, 'utils/events.mjs'),
            resolve(distDir, 'utils/hash.mjs'),
            resolve(distDir, 'utils/human-id.mjs'),
            resolve(distDir, 'utils/nanoid.mjs'),
            resolve(distDir, 'utils/promise.mjs'),
            resolve(distDir, 'utils/shared-state.mjs'),
            resolve(distDir, 'utils/streaming-channel.mjs'),
            resolve(distDir, 'utils/structured-clone.mjs'),
            resolve(distDir, 'utils/when.mjs'),
          ],
          cwd: here,
        })
      },
    },
  },
  {
    clean: false,
    platform: 'node',
    tsconfig,
    deps,
    dts: false,
    entry: serverEntries,
  },
  {
    clean: false,
    platform: 'neutral',
    tsconfig,
    deps,
    dts: { emitDtsOnly: true },
    outExtensions: () => ({ dts: '.d.mts' }),
    entry: { ...clientEntries, ...serverEntries },
  },
])
