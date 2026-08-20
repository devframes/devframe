import type { HubDevframeEntry } from '@devframes/hub/initiate'
import { fileURLToPath } from 'node:url'
import { createUi } from '@devframes/hub-ui'
import { viteDevframeHub } from '@devframes/vite/hub'
import { defineConfig } from 'vite'
import devframe from '../../src/devframe.ts'

// The hub playground: a minimal Vite host that mounts this devframe as a dock
// inside the devframe hub, using the default @devframes/hub-ui.
//
// The hub synthesizes an iframe dock that points to the devframe's built
// SPA (at `dist/client`, which must be built first) and mounts it alongside
// other hub tools.

// Customize the synthesized iframe dock entry: title and icon.
const entry: HubDevframeEntry = {
  devframe,
  dock: {
    title: 'Starter',
    icon: 'ph:rocket-launch-duotone',
  },
}

export default defineConfig({
  // This config's own directory - `index.html` lives here, not at the cwd
  // the `play:hub` script runs from (the starter's package root).
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Dev tooling reached from arbitrary hostnames (LAN IPs, tunnels): accept
  // any Host header and fall back to the next free port when busy.
  server: { allowedHosts: true, strictPort: false },
  plugins: [
    viteDevframeHub({
      // This playground demonstrates mounting a hub directly in Vite, not
      // recommending it over Vite DevTools - silence the one-time notice.
      quiet: true,
      devframes: [entry],
      // Use the default hub-ui, rebrand it to match the starter's accent color.
      ui: createUi({ branding: { primaryColor: '#10b981', productName: 'Devframe Starter' } }),
      // Ungated localhost demo - skip the trust handshake.
      auth: false,
    }),
  ],
})
