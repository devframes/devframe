import type { UserConfig } from 'unocss'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { transform } from 'lightningcss'
import MagicString from 'magic-string'
import { glob } from 'tinyglobby'
import { createGenerator } from 'unocss'
import { namespaceShadowCssVars, rewireBakedPrimaryColors, shadowSurfaceSafelist } from './uno.config'

// Story-only utility classes must not leak into a shipped shadow-root
// stylesheet.
const IGNORE = ['**/*.stories.*', '**/__tests__/**']

export interface BuildShadowCssOptions {
  /**
   * Absolute path of the package's UnoCSS-scanned source directory. The
   * compiled stylesheet is written to `<srcDir>/.generated/css.ts`.
   */
  srcDir: string
  /** Glob patterns (relative to `srcDir`) UnoCSS extracts classes from. */
  globs: string[]
  /** The package's own `uno.config` default export. */
  config: UserConfig<any>
  /**
   * Absolute path to the primary-ramp override stylesheet, appended AFTER
   * the UnoCSS output so its `:host`/`:root, :host` block wins over Wind's
   * own primary declarations (see each package's `primary-ramp.css`).
   */
  primaryRampPath: string
  /**
   * Absolute path to a hand-authored stylesheet run through the generator's
   * configured transformers (directives, variant groups) and merged in
   * right after the CSS reset. Omit for a package with no hand-written
   * styles.
   */
  userStylePath?: string
  /**
   * Prefix Wind's `--un-*` custom properties are renamed to (see
   * `namespaceShadowCssVars`) — unique per shadow-root surface so two
   * shadow trees on the same host page never collide.
   */
  varPrefix: string
}

export interface BuildShadowCssResult {
  /** Number of source files scanned for class extraction. */
  sourceCount: number
  /** The compiled, minified shadow-root stylesheet. */
  css: string
}

// Compile a shadow-root surface's UnoCSS output ahead of time into a plain
// string module (`<srcDir>/.generated/css.ts`) that the surface adopts into
// its shadow root — fully styled inside any host page without a global
// stylesheet, and immune to the host page's own styles leaking in. Shared by
// `@devframes/hub-ui`'s dock and `@devframes/json-render-ui`'s renderer
// module: same pipeline, same two shadow-root gotchas (see the root
// AGENTS.md "Design system" section), different source globs. Writes the
// generated file itself; returns stats so each caller (a `scripts/` entry,
// exempt from the `no-console` lint rule) prints its own summary line.
export async function buildShadowCss(options: BuildShadowCssOptions): Promise<BuildShadowCssResult> {
  const { srcDir, globs, config, primaryRampPath, userStylePath, varPrefix } = options
  const generatedCss = join(srcDir, '.generated/css.ts')

  const require = createRequire(import.meta.url)
  const reset = await fs.readFile(require.resolve('@unocss/reset/tailwind.css'), 'utf-8')
  const files = await glob(globs, {
    cwd: srcDir,
    absolute: true,
    ignore: IGNORE,
  })

  // Shadow-root surfaces reuse `@antfu/design`'s Vue components (buttons,
  // badges, …) directly. UnoCSS ignores `node_modules` by default, so their
  // semantic shortcut classes (`btn-primary`, `btn-action`, `badge-*`, …)
  // would be absent from the shadow-root stylesheet — scan the design
  // package's component sources too so those classes ship in the injected
  // CSS.
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

  // The hand-written stylesheet (if any) may use `--at-apply` — run it
  // through the configured transformers (directives, variant groups) before
  // merging.
  const userStyle = userStylePath
    ? new MagicString(await fs.readFile(userStylePath, 'utf-8').catch(() => ''))
    : undefined
  if (userStyle) {
    for (const transformer of generator.config.transformers ?? []) {
      await transformer.transform(userStyle, userStylePath!, { uno: generator } as any)
    }
  }

  const primaryRamp = await fs.readFile(primaryRampPath, 'utf-8')
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
  // Namespace Wind's `--un-*` vars so this shadow-root stylesheet is immune
  // to a host page's Wind4 `@property` registrations (see
  // `namespaceShadowCssVars`).
  let css = [
    reset,
    userStyle?.toString(),
    unoCss,
    surfacesCss,
    primaryRamp,
  ].filter((part): part is string => part !== undefined).join('\n')

  css = namespaceShadowCssVars(css, varPrefix)
  css = transform({
    filename: 'hub-ui.css',
    code: Buffer.from(css),
    minify: true,
  }).code.toString()

  await fs.mkdir(join(srcDir, '.generated'), { recursive: true })
  await fs.writeFile(generatedCss, [
    `/* eslint-disable eslint-comments/no-unlimited-disable */`,
    `/* eslint-disable */`,
    `export default ${JSON.stringify(String(css))}`,
    '',
  ].join('\n'))

  return { sourceCount: files.length, css }
}
