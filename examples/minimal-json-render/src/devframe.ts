import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import pkg from '../package.json' with { type: 'json' }
import { createDashboardView } from './dashboard.ts'

const BASE_PATH = '/__minimal-json-render/'
const distDir = fileURLToPath(new URL('../dist/client', import.meta.url))

export default defineDevframe({
  id: 'minimal-json-render',
  name: 'Minimal JSON-Render',
  version: pkg.version,
  packageName: pkg.name,
  homepage: pkg.homepage,
  description: pkg.description,
  icon: 'ph:layout-duotone',
  basePath: BASE_PATH,
  cli: {
    command: 'minimal-json-render',
    port: 9877,
    distDir,
    // Single-user localhost demo — skip the trust handshake so the served SPA
    // can call the action RPCs without an OTP round-trip.
    auth: false,
  },
  spa: { loader: 'none' },
  setup(ctx) {
    createDashboardView(ctx)
  },
})
