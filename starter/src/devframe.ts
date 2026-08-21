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
    // `auth` is deliberately left unset: gated by default (devframe's
    // interactive OTP handshake - a 6-digit code printed to the terminal
    // that trusts the browser before it can call any RPC function).
    // `auth: false` would trust *any* connection that can reach the port
    // instead - see docs/guide/security.md before reaching for it. A
    // developer who wants to skip the prompt for a one-off loopback-only
    // session can pass `--no-auth` per run (`devframe-starter --no-auth`)
    // rather than baking the opt-out into the definition.
  },
  setup(ctx) {
    // A scoped context auto-namespaces every registered id with `NAMESPACE:`.
    const my = ctx.scope(NAMESPACE)
    for (const fn of serverFunctions)
      my.rpc.register(fn)
  },
})
