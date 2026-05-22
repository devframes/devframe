import { defineConfig } from 'vite'
import { alias } from '../../alias'
import demoDevframe from './src/devframe'
import { minimalViteDevframeHub } from './src/minimal-vite-devframe-hub'

export default defineConfig({
  resolve: { alias },
  plugins: [
    minimalViteDevframeHub({
      devframes: [demoDevframe],
    }),
  ],
})
