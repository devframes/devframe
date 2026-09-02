import { fileURLToPath } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { alias } from '../../../alias'
import { hubUiPlaygroundHub } from './hub-plugin'

/**
 * Dev-serves this package's own client source (the floating `DockEmbedded`
 * bootstrap and the standalone `DockStandalone` viewer) against a real,
 * local hub instance, with full HMR on every `.vue`/`.ts` file under
 * `src/client`, no build step. Run with `pnpm --filter @devframes/hub-ui dev`.
 *
 * `main.ts` mounts `DockStandalone`/`DockEmbedded` straight from source, the
 * same way a built `createUi()` viewer would, just unbundled; see
 * `hub-plugin.ts` for why this doesn't reuse `@devframes/vite/hub`.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  /**
   * Reached from arbitrary hostnames (LAN IPs, tunnels, tailnets) like the
   * other reference hub hosts in this repo.
   */
  server: { allowedHosts: true, strictPort: false },
  plugins: [
    Vue(),
    hubUiPlaygroundHub(),
  ],
})
