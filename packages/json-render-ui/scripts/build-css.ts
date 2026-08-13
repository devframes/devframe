import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { colors as c } from 'devframe/utils/colors'
import { glob } from 'tinyglobby'
import { createGenerator } from 'unocss'
import { namespaceShadowCssVars, shadowSurfaceSafelist } from '../../../design/uno.config'
import config from '../uno.config'

// Compile the renderer's UnoCSS output ahead of time into a plain string
// module (`src/.generated/css.ts`) that the prebuilt renderer module adopts
// into the shadow root it attaches inside its mount container — the dock view
// stays fully styled inside any host page (light DOM or a viewer's shadow
// root) without a global stylesheet, and without leaking the reset into the
// host page. Mirrors `@devframes/hub-ui`'s `scripts/build-css.ts`.
const PKG_DIR = fileURLToPath(new URL('..', import.meta.url))
const SRC_DIR = join(PKG_DIR, 'src')
const GLOBS = ['components/**/*.ts', 'renderer.ts', 'dock-renderer.ts', 'renderer-module/**/*.ts']
// Story-only utility classes must not leak into the shipped stylesheet.
const IGNORE = ['**/*.stories.*', '**/__tests__/**']
// The single-overridable-variable primary ramp, appended AFTER the UnoCSS
// output so its `:root, :host` block wins over Wind4's own primary
// declarations — a viewer's `--devframe-primary` branding inherits across the
// shadow boundary and retints the rendered views. See the file's own comment.
const PRIMARY_RAMP = join(SRC_DIR, 'renderer-module/primary-ramp.css')
const GENERATED_CSS = join(SRC_DIR, '.generated/css.ts')

export async function buildCSS(): Promise<void> {
  const require = createRequire(import.meta.url)
  const reset = await fs.readFile(require.resolve('@unocss/reset/tailwind.css'), 'utf-8')
  const files = await glob(GLOBS, {
    cwd: SRC_DIR,
    absolute: true,
    ignore: IGNORE,
  })

  // The catalog components reuse `@antfu/design`'s Vue components (buttons,
  // badges, form controls, …) directly. UnoCSS ignores `node_modules` by
  // default, so their semantic shortcut classes would be absent from the
  // shadow-root stylesheet — scan the design package's component sources too.
  const designComponentsDir = join(require.resolve('@antfu/design/package.json'), '..', 'components')
  const designFiles = await glob('**/*.vue', {
    cwd: designComponentsDir,
    absolute: true,
    ignore: IGNORE,
  })

  const generator = await createGenerator(config)

  const tokens = new Set<string>()
  for (const file of [...files, ...designFiles]) {
    const content = await fs.readFile(file, 'utf-8')
    await generator.applyExtractors(content, file, tokens)
  }

  const primaryRamp = await fs.readFile(PRIMARY_RAMP, 'utf-8')
  const unoResult = await generator.generate(tokens)
  // Wind3 drops a *plain* semantic shortcut (`.bg-base` / `.color-base`) from
  // the main pass when the same shortcut also appears variant-prefixed in the
  // sources (e.g. `@antfu/design`'s Tabs emits `data-[state=active]:bg-base`) —
  // a shortcut+variant interaction. Generate the shadow-surface tokens in a
  // dedicated pass so their plain (and `.dark`) rules are always present.
  const surfaces = await generator.generate(shadowSurfaceSafelist.join(' '))
  // Namespace Wind's `--un-*` vars (→ `--un-jr-*`) so this shadow-root
  // stylesheet is immune to a host page's Wind4 `@property` registrations
  // (see `namespaceShadowCssVars`).
  const css = namespaceShadowCssVars([
    reset,
    unoResult.css,
    surfaces.css,
    primaryRamp,
  ].join('\n'), '--un-jr-')

  await fs.mkdir(join(SRC_DIR, '.generated'), { recursive: true })
  await fs.writeFile(GENERATED_CSS, [
    `/* eslint-disable eslint-comments/no-unlimited-disable */`,
    `/* eslint-disable */`,
    `export default ${JSON.stringify(String(css))}`,
    '',
  ].join('\n'))
  console.log(`${c.green('✓')} CSS built (${files.length} sources, ${(css.length / 1024).toFixed(1)} kB)`)
}

await buildCSS()
