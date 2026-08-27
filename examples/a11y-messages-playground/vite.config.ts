import createA11yDevframe, { a11yPageScriptBundlePath } from '@devframes/plugin-a11y'
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
    a11yMessagesPlayground({
      devframes: [a11yDevframe, messagesDevframe],
      // Attach the a11y agent as the a11y dock's client script - served over
      // Vite's `/@fs/` so it shares this page's origin (the BroadcastChannel the
      // agent and panel talk over rides that origin).
      clientScripts: {
        [a11yDevframe.id]: { importFrom: `/@fs/${a11yPageScriptBundlePath}` },
      },
    }),
  ],
})
