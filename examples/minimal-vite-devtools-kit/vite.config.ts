import { defineConfig } from 'vite'
import { alias } from '../../alias'
import demoDevframe from './src/devframe'
import { minimalHubKit } from './src/minimal-hub-kit'

export default defineConfig({
  resolve: { alias },
  plugins: [
    minimalHubKit({
      devframes: [demoDevframe],
    }),
  ],
})
