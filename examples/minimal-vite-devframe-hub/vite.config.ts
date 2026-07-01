import a11yDevframe from '@devframes/plugin-a11y'
import { a11yAgent } from '@devframes/plugin-a11y/vite'
import codeServerDevframe from '@devframes/plugin-code-server'
import gitDevframe from '@devframes/plugin-git'
import inspectDevframe from '@devframes/plugin-inspect'
import terminalsDevframe from '@devframes/plugin-terminals'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../alias'
import demoDevframe from './src/devframe'
import demoDevframeB from './src/devframe-b'
import { minimalViteDevframeHub } from './src/minimal-vite-devframe-hub'

export default defineConfig({
  resolve: { alias },
  plugins: [
    UnoCSS(),
    // Load the a11y inspector agent into this hub's own page so its docked
    // panel scans the host live. The panel (mounted below) and this agent
    // share the Vite origin, so their BroadcastChannel connects.
    a11yAgent(),
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
      ],
    }),
  ],
})
