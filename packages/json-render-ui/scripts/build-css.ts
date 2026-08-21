import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { colors as c } from 'devframe/utils/colors'
import { buildShadowCss } from '../../../design/build-shadow-css'
import config from '../uno.config'

// Compiles the renderer's UnoCSS output ahead of time into a plain string
// module (`src/.generated/css.ts`) that the prebuilt renderer module adopts
// into the shadow root it attaches inside its mount container — the dock view
// stays fully styled inside any host page (light DOM or a viewer's shadow
// root) without a global stylesheet, and without leaking the reset into the
// host page. See `design/build-shadow-css.ts` for the shared pipeline
// (mirrored by `@devframes/hub-ui`'s `scripts/build-css.ts`).
const SRC_DIR = join(fileURLToPath(new URL('..', import.meta.url)), 'src')
const moduleRequire = createRequire(import.meta.url)

const { sourceCount, css } = await buildShadowCss({
  srcDir: SRC_DIR,
  globs: ['components/**/*.ts', 'renderer.ts', 'dock-renderer.ts', 'renderer-module/**/*.ts'],
  config,
  primaryRampPath: join(SRC_DIR, 'renderer-module/primary-ramp.css'),
  userStylePath: [
    moduleRequire.resolve('@antfu/design/styles/scrollbar.css'),
    join(SRC_DIR, 'renderer-module/style.css'),
  ],
  varPrefix: '--un-jr-',
})
console.log(`${c.green('✓')} CSS built (${sourceCount} sources, ${(css.length / 1024).toFixed(1)} kB)`)
