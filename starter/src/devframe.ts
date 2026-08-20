import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe'
import pkg from '../package.json' with { type: 'json' }
import { NAMESPACE, serverFunctions } from './rpc/index.ts'
import { BASE_PATH } from './shared/base-path.ts'

const distDir = fileURLToPath(new URL('../dist/client', import.meta.url))

/**
 * The single `DevframeDefinition` every surface consumes: the CLI
 * (`bin.mjs`), the single playground, and the hub playground all import
 * this one object.
 */
export default defineDevframe({
  id: 'devframe-starter',
  name: 'Devframe Starter',
  version: pkg.version,
  packageName: pkg.name,
  importMetaUrl: import.meta.url,
  homepage: pkg.homepage,
  description: pkg.description,
  icon: 'ph:rocket-launch-duotone',
  basePath: BASE_PATH,
  cli: {
    command: 'devframe-starter',
    port: 7391,
    distDir,
    // Single-user localhost demo - skip the trust handshake so the served
    // SPA can call RPC without an OTP round-trip.
    auth: false,
    // Serve the agent (MCP) surface over the dev server's `/__mcp` route.
    mcp: true,
  },
  setup(ctx) {
    // A scoped context auto-namespaces every registered id with `NAMESPACE:`.
    const my = ctx.scope(NAMESPACE)
    for (const fn of serverFunctions)
      my.rpc.register(fn)
  },
})
