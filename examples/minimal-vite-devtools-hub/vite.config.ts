import { defineConfig } from 'vite'
import { alias } from '../../alias'
import demoDevframe from './src/devframe'
import { minimalViteDevToolsHub } from './src/minimal-vite-devtools-hub'

export default defineConfig({
  resolve: { alias },
  plugins: [
    minimalViteDevToolsHub({
      devframes: [demoDevframe],
    }),
  ],
})
