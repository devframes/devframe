import { createJsonRenderDevframe } from '@devframes/json-render-ui/spa'
import pkg from '../package.json' with { type: 'json' }
import { createDashboardView } from './dashboard.ts'

// `createJsonRenderDevframe` presets `spa.loader: 'none'` and points
// `cli.distDir` at the prebuilt `@devframes/json-render-ui` SPA, so this
// example serves the out-of-box renderer with no client build of its own.
export default createJsonRenderDevframe({
  id: 'minimal-json-render',
  name: 'Minimal JSON-Render',
  version: pkg.version,
  packageName: pkg.name,
  homepage: pkg.homepage,
  description: pkg.description,
  icon: 'ph:layout-duotone',
  basePath: '/__minimal-json-render/',
  cli: {
    command: 'minimal-json-render',
    port: 9877,
    // Single-user localhost demo — skip the trust handshake so the served SPA
    // can call the action RPCs without an OTP round-trip.
    auth: false,
  },
  setup(ctx) {
    createDashboardView(ctx)
  },
})
