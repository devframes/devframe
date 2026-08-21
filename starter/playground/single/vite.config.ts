import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { devframeViteBridge } from '@devframes/vite/single'
import { defineConfig } from 'vite'
import devframe from '../../src/devframe.ts'

// The single playground: Vite dev-serves the vanilla-TS SPA (this
// directory's own `index.html`/`main.ts`, at the server root, with full
// HMR) while `devframeViteBridge` answers the RPC/WS/discovery routes at
// the devframe's own base path (`/__devframe-starter/`) - a *different*
// prefix than the SPA's, since the bridge's middleware claims every request
// under its base with no passthrough and so can't share one with Vite's own
// SPA serving. `playground/single/main.ts` points `connectDevframe` at that
// base explicitly instead of relying on `document.baseURI`.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    // Explicit IPv4: the default `localhost` host can resolve to the IPv6
    // loopback on some systems, which the pinned `port` below doesn't fix
    // by itself (e2e tooling dials `127.0.0.1` directly).
    host: '127.0.0.1',
    // Dev tooling reached from arbitrary hostnames (LAN IPs, tunnels):
    // accept any Host header.
    allowedHosts: true,
    // Pinned (rather than an auto-picked free port) so `playwright.config.ts`
    // can point at a known URL.
    port: devframe.cli!.port,
    strictPort: true,
  },
  plugins: [
    devframeViteBridge(devframe, {
      base: devframe.basePath,
      // Gated by default (devframe's interactive OTP) when unset, same as
      // `bin.mjs dev` - see the comment on `cli` in `src/devframe.ts`.
      // `DEVFRAME_E2E` is set only by `playwright.config.ts`'s
      // `webServer.env`, so the automated e2e suite can drive the bridge
      // without solving the OTP prompt; a plain `pnpm run play:single`
      // still gates. Don't widen this to a bare `auth: false` - that
      // trusts every connection that can reach the port, not just this
      // test harness. See docs/guide/security.md.
      auth: process.env.DEVFRAME_E2E ? false : undefined,
    }),
  ],
})
