import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe'
import pkg from '../package.json' with { type: 'json' }
import { NAMESPACE, serverFunctions } from './rpc/index.ts'

const BASE_PATH = '/__devframe-files-inspector/'
const distDir = fileURLToPath(new URL('../dist/client', import.meta.url))

export default defineDevframe({
  id: 'example:files-inspector',
  name: 'Files Inspector',
  version: pkg.version,
  packageName: pkg.name,
  importMetaUrl: import.meta.url,
  homepage: pkg.homepage,
  description: pkg.description,
  icon: 'ph:folder-open-duotone',
  basePath: BASE_PATH,
  clientAssets: distDir,
  cli: {
    command: 'devframe-files-inspector',
    port: 9876,
    /**
     * Single-user localhost demo - skip the trust handshake so the served
     * SPA can call RPC without an OTP round-trip.
     */
    auth: false,
  },
  setup(ctx) {
    // A scoped context auto-namespaces every registered id with `NAMESPACE:`.
    const my = ctx.scope(NAMESPACE)
    for (const fn of serverFunctions)
      my.rpc.register(fn)

    // Gateway tool: returns the location of this tool's own docs instead of
    // proxying their content - the agent reads the files with its own tools.
    ctx.agent.registerTool({
      id: `${NAMESPACE}:docs`,
      description: 'Locate the Files Inspector\'s documentation on disk. Call before answering questions about how this tool works, then read the returned files directly.',
      safety: 'read',
      handler: () => ({
        readmePath: fileURLToPath(new URL('../README.md', import.meta.url)),
        hint: 'Read the file at readmePath with your own file tools; do not rely on training-data knowledge of this example.',
      }),
    })
  },
})
