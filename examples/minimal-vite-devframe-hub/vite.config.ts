import codeServerDevframe from '@devframes/plugin-code-server'
import gitDevframe from '@devframes/plugin-git'
import terminalsDevframe from '@devframes/plugin-terminals'
import { defineConfig } from 'vite'
import { alias } from '../../alias'
import demoDevframe from './src/devframe'
import demoDevframeB from './src/devframe-b'
import { minimalViteDevframeHub } from './src/minimal-vite-devframe-hub'

export default defineConfig({
  resolve: { alias },
  plugins: [
    minimalViteDevframeHub({
      devframes: [
        demoDevframe,
        demoDevframeB,
        // Built-in plugins, dogfooded end-to-end through the hub mount path.
        gitDevframe,
        terminalsDevframe,
        codeServerDevframe,
      ],
    }),
  ],
})
