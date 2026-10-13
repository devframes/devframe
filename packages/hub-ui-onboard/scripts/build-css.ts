import { fileURLToPath } from 'node:url'
import { buildShadowCss } from '../../../design/build-shadow-css'
import config from '../uno.config'

// Compiles the UnoCSS output into `src/client/.generated/css.ts`, adopted
// into the floating button's shadow root.
const SRC_DIR = fileURLToPath(new URL('../src/client', import.meta.url))

const { sourceCount, css } = await buildShadowCss({
  srcDir: SRC_DIR,
  globs: ['**/*.ts'],
  config,
  primaryRampPath: fileURLToPath(new URL('../../../design/primary-ramp.css', import.meta.url)),
  userStylePath: fileURLToPath(new URL('../src/client/style.css', import.meta.url)),
  varPrefix: '--un-onboard-',
  scanDesignComponents: false,
})
console.log(`CSS built (${sourceCount} sources, ${(css.length / 1024).toFixed(1)} kB)`)
