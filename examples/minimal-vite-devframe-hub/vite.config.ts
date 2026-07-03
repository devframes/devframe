import a11yDevframe, { a11yAgentBundlePath } from '@devframes/plugin-a11y'
import codeServerDevframe from '@devframes/plugin-code-server'
import gitDevframe from '@devframes/plugin-git'
import inspectDevframe from '@devframes/plugin-inspect'
import messagesDevframe from '@devframes/plugin-messages'
import terminalsDevframe from '@devframes/plugin-terminals'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../alias'
import demoDevframe from './src/devframe'
import demoDevframeB from './src/devframe-b'
import { minimalViteDevframeHub } from './src/minimal-vite-devframe-hub'

export default defineConfig({
  resolve: { alias },
  // Dev tooling reached from arbitrary hostnames (LAN IPs, tunnels, tailnets):
  // accept any Host header and fall back to the next free port when busy.
  server: { allowedHosts: true, strictPort: false },
  plugins: [
    UnoCSS(),
    minimalViteDevframeHub({
      devframes: [
        demoDevframe,
        demoDevframeB,
        // Every built-in plugin, dogfooded end-to-end through the hub mount
        // path — the same set a full viewer like vite-devtools would surface.
        gitDevframe,
        terminalsDevframe,
        codeServerDevframe,
        inspectDevframe,
        a11yDevframe,
        messagesDevframe,
      ],
      // Attach the a11y inspector's in-page agent as its dock's client script.
      // The hub client runtime (booted in src/client/main.ts) imports it into
      // this page so the docked panel scans the host live — no bespoke
      // injection plugin needed. `/@fs/` lets Vite serve the built module.
      clientScripts: {
        [a11yDevframe.id]: { importFrom: `/@fs/${a11yAgentBundlePath}` },
      },
    }),
  ],
})
