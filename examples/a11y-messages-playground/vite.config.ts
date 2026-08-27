import createA11yDevframe from '@devframes/plugin-a11y'
import createMessagesDevframe from '@devframes/plugin-messages'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../alias'
import { a11yMessagesPlayground } from './src/a11y-messages-playground'

const a11yDevframe = createA11yDevframe()
const messagesDevframe = createMessagesDevframe()

export default defineConfig({
  resolve: { alias },
  server: { allowedHosts: true, strictPort: false },
  optimizeDeps: { exclude: ['@antfu/design'] },
  plugins: [
    UnoCSS(),
    // The a11y inspector ships its own page script (its dock's `clientScript`),
    // so the hub serves it same-origin and boots it - the panel scans this page
    // live with no wiring here.
    a11yMessagesPlayground({
      devframes: [a11yDevframe, messagesDevframe],
    }),
  ],
})
