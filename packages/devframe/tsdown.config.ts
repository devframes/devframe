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

// Split into two configs so client/agnostic and server entries live in
// independent rolldown chunk graphs. A single combined build lets rolldown
// hoist shared helpers into chunks that mix server-only imports like
// `devframe/rpc/transports/ws-server` or `node:crypto`, which then leak into
// browser-loaded outputs (e.g. `client/index.mjs`, `utils/hash.mjs`).
export default defineConfig([
  // Client / agnostic build — runs first; `clean: true` clears dist/ before
  // the server build appends to it. Keep this first in the array.
  {
    clean: true,
    platform: 'browser',
    tsconfig,
    deps,
    dts: true,
    // Force `.mjs` / `.d.mts` extensions to match the server config and the
    // `packages/devframe/package.json` `exports` map. `platform: 'browser'`
    // defaults to `.js`, which would break those entry paths.
    outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
    entry: {
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
    },
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
  // Server / node build — `clean: false` so it appends to the client output.
  {
    clean: false,
    platform: 'node',
    tsconfig,
    deps,
    dts: true,
    entry: {
      'index': 'src/index.ts',
      'constants': 'src/constants.ts',
      'types/index': 'src/types/index.ts',
      'rpc/index': 'src/rpc/index.ts',
      'rpc/client': 'src/rpc/client.ts',
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
    },
  },
])
