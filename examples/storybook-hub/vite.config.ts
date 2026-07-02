import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../alias'
import { storybookHub } from './src/storybook-hub'

export default defineConfig({
  resolve: { alias },
  // Dev tooling reached from arbitrary hostnames (LAN IPs, tunnels, tailnets):
  // accept any Host header and fall back to the next free port when busy.
  server: { allowedHosts: true, strictPort: false },
  preview: { allowedHosts: true, strictPort: false },
  plugins: [
    UnoCSS(),
    storybookHub(),
  ],
})
