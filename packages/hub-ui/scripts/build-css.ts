import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { colors as c } from 'devframe/utils/colors'
import { transform } from 'lightningcss'
import MagicString from 'magic-string'
import { glob } from 'tinyglobby'
import { createGenerator } from 'unocss'
import { namespaceShadowCssVars, rewireBakedPrimaryColors, shadowSurfaceSafelist } from '../../../design/uno.config'
import config from '../uno.config'

// Compile the components' UnoCSS output ahead of time into a plain string
// module (`src/client/.generated/css.ts`) that `defineCustomElement` adopts
// into each shadow root — the dock stays fully styled inside any host page
// without a global stylesheet, and the host page's own styles can't leak in.
const SRC_DIR = fileURLToPath(new URL('../src/client', import.meta.url))
const GLOBS = ['components/**/*.{ts,vue}', 'state/**/*.ts', 'embedded/**/*.ts', 'standalone/**/*.{ts,html}']
// Story-only utility classes must not leak into the shipped stylesheet.
const IGNORE = ['**/*.stories.*', '**/__tests__/**']
const USER_STYLE = join(SRC_DIR, 'style.css')
// The single-overridable-variable primary ramp. Appended AFTER the UnoCSS
// output so its `:host` block wins over Wind4's own `:root, :host` primary
// declarations (kept in its own file so the Storybook preview can import the
// exact same override after `virtual:uno.css`). See the file's own comment.
const PRIMARY_RAMP = join(SRC_DIR, 'primary-ramp.css')
const GENERATED_CSS = join(SRC_DIR, '.generated/css.ts')

export async function buildCSS(): Promise<void> {
  const require = createRequire(import.meta.url)
  const reset = await fs.readFile(require.resolve('@unocss/reset/tailwind.css'), 'utf-8')
  const files = await glob(GLOBS, {
    cwd: SRC_DIR,
    absolute: true,
    ignore: IGNORE,
  })

  // The dock reuses `@antfu/design`'s Vue components (buttons, badges, …)
  // directly. UnoCSS ignores `node_modules` by default, so their semantic
  // shortcut classes (`btn-primary`, `btn-action`, `badge-*`, …) would be
  // absent from the shadow-root stylesheet — scan the design package's
  // component sources too so those classes ship in the injected CSS.
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

  // The hand-written stylesheet may use `--at-apply` — run it through the
  // configured transformers (directives, variant groups) before merging.
  const userStyle = new MagicString(await fs.readFile(USER_STYLE, 'utf-8').catch(() => ''))
  for (const transformer of generator.config.transformers ?? []) {
    await transformer.transform(userStyle, USER_STYLE, { uno: generator } as any)
  }

  const primaryRamp = await fs.readFile(PRIMARY_RAMP, 'utf-8')
  const unoResult = await generator.generate(tokens)
  // Wind3 drops a *plain* semantic shortcut (`.bg-base` / `.color-base`) from
  // the main pass when the same shortcut also appears variant-prefixed in the
  // sources (e.g. `@antfu/design`'s Tabs emits `data-[state=active]:bg-base`) —
  // a shortcut+variant interaction. Generate the shadow-surface tokens in a
  // dedicated pass so their plain (and `.dark`) rules are always present.
  const surfaces = await generator.generate(shadowSurfaceSafelist.join(' '))
  // Wind3 bakes the `primary` theme color to literal `rgb()` triplets at
  // generate-time — rewire them to read the live `--colors-primary-*`
  // variables `primary-ramp.css` derives from `--devframe-primary`, so a
  // rebrand actually retints `text-primary`/`bg-primary`/`btn-primary`/…
  // (see `rewireBakedPrimaryColors`'s own comment).
  const primaryTheme = (generator.config.theme as { colors?: Record<string, Record<string, string>> }).colors?.primary ?? {}
  const unoCss = rewireBakedPrimaryColors(unoResult.css, primaryTheme)
  const surfacesCss = rewireBakedPrimaryColors(surfaces.css, primaryTheme)
  // Namespace Wind's `--un-*` vars (→ `--un-hub-*`) so this shadow-root
  // stylesheet is immune to a host page's Wind4 `@property` registrations
  // (see `namespaceShadowCssVars`).
  let css = [
    reset,
    userStyle.toString(),
    unoCss,
    surfacesCss,
    primaryRamp,
  ].join('\n')

  css = namespaceShadowCssVars(css, '--un-hub-')
  css = transform({
    filename: 'hub-ui.css',
    code: Buffer.from(css),
    minify: true,
  }).code.toString()

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
