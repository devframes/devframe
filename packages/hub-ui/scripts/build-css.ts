import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { colors as c } from 'devframe/utils/colors'
import { buildShadowCss } from '../../../design/build-shadow-css'
import config from '../uno.config'

// Compiles UnoCSS output ahead of time into a string module
// (`src/client/.generated/css.ts`) that `defineCustomElement` adopts into each
// shadow root, so the dock stays styled in any host page with no leakage.
const SRC_DIR = fileURLToPath(new URL('../src/client', import.meta.url))

const { sourceCount, css } = await buildShadowCss({
  srcDir: SRC_DIR,
  globs: ['components/**/*.{ts,vue}', 'state/**/*.ts', 'embedded/**/*.ts', 'standalone/**/*.{ts,html}'],
  config,
  primaryRampPath: join(SRC_DIR, 'primary-ramp.css'),
  userStylePath: join(SRC_DIR, 'style.css'),
  varPrefix: '--un-hub-',
})
console.log(`${c.green('✓')} CSS built (${sourceCount} sources, ${(css.length / 1024).toFixed(1)} kB)`)
