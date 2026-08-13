import type { Preset } from 'unocss'
import { fileURLToPath } from 'node:url'
import { presetAnthonyDesign } from '@antfu/design/unocss'
import {
  defineConfig,
  presetIcons,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export interface CreateDesignConfigOptions {
  /**
   * The base utility preset `@antfu/design` layers on top of. Defaults to
   * {@link presetWind4} (what every plugin and example uses). Surfaces that
   * render inside a **web-component shadow root** (the hub-ui dock, the
   * json-render renderer module) pass `presetWind3()` instead: Wind4 registers
   * its theme + `--un-*` custom properties via `@property { inherits: false }`
   * and keeps them in a document `:root {}` block, neither of which reaches a
   * shadow tree — so its `color-mix(var(--colors-*))` utilities resolve to
   * nothing there. Wind3 bakes the same `@antfu/design` semantic utilities to
   * concrete `rgb()` + `.dark` variants, which are self-contained inside a
   * shadow root.
   */
  base?: Preset<any> | Preset<any>[]
}

// Shared devframe UnoCSS base. Every plugin and example composes `@antfu/design`
// the same way — its preset (tuned to devframe's sage green) over a Wind base,
// Phosphor icons, DM Sans/Mono web fonts, and the directive/variant-group
// transformers — so the surfaces look and feel like one product across
// frameworks. Each app extends this via `mergeConfigs([designConfig, { … }])`
// and contributes only its own extraction globs (and any safelist).
//
// The shared web fonts (`sans`/`mono`), the named `z-*` layers and the `h-nav`
// navbar height live here so every surface shares one font stack, one z-index
// scale and one fixed navbar height. The `@antfu/design` preset blocks plain
// `z-<number>`, so the layers are named on purpose.
export function createDesignConfig(options: CreateDesignConfigOptions = {}) {
  const base = options.base ?? presetWind4()
  return defineConfig({
    presets: [
      presetAnthonyDesign({ primary: '#3a6a45' }),
      ...(Array.isArray(base) ? base : [base]),
      presetIcons({ scale: 1.1 }),
    ],
    transformers: [transformerDirectives(), transformerVariantGroup()],
    // The shared class-helper builders (`design/design.ts`) assemble their class
    // chains at runtime, so every app scans that one file (it carries
    // `@unocss-include`) for extraction regardless of its own framework globs.
    content: {
      filesystem: [fileURLToPath(new URL('./design.ts', import.meta.url))],
    },
    // Wind leaves bare `border`/`border-b` at currentColor; restore the subtle
    // shared border color (matching `border-base`) for unqualified borders.
    preflights: [{ getCSS: () => '*,::before,::after{border-color:#8882}' }],
    shortcuts: {
      // Fixed navbar height, shared by every surface's top nav.
      'h-nav': 'h-10',
      // Named z-index layers, shared across every surface.
      'z-nav': 'z-[30]',
      'z-dropdown': 'z-[40]',
      'z-tooltip': 'z-[45]',
      'z-toast': 'z-[50]',
      'z-modal-backdrop': 'z-[60]',
      'z-modal-content': 'z-[70]',
      'z-drawer-backdrop': 'z-[80]',
      'z-drawer-content': 'z-[90]',
    },
  })
}

// The default shared base (Wind4), consumed by every plugin and example.
export const designConfig = createDesignConfig()

/**
 * The `@antfu/design` semantic surface/text tokens a shadow-root surface
 * (hub-ui dock, json-render renderer module) needs guaranteed in its compiled
 * stylesheet. Each is a shortcut that expands to a base utility plus a
 * `.dark:` variant; safelisting the shortcut name makes the generator emit
 * both variants even when the class only reaches the extractor through a
 * `.dark`-prefixed or dynamically-assembled string it can't see. Wind3 bakes
 * these to concrete `rgb()`, so they stay self-contained inside the shadow
 * tree.
 */
/**
 * Rename Wind's internal `--un-*` custom properties to a private prefix in a
 * stylesheet destined for a **shadow root**.
 *
 * `@property` registrations are document-global regardless of where they're
 * declared, so a host page built with Wind4 registers `--un-bg-opacity` /
 * `--un-border-opacity` / `--un-text-opacity` (et al.) as
 * `@property { syntax: '<percentage>'; inherits: false }` for the whole
 * document — including inside our shadow tree. Our shadow CSS is Wind3, which
 * sets those same vars **unitless** (`--un-border-opacity: 0.13`), so the
 * global `<percentage>` registration makes every such declaration invalid and
 * the dependent `color-mix()` / `rgb(… / var(--un-*))` value collapses (a
 * visibly wrong border/background/text color).
 *
 * The shadow stylesheet sets and reads these vars entirely within itself, so
 * renaming every `--un-` to `--dfun-` keeps it self-consistent while making it
 * immune to whatever the host page registered. Apply only to shadow-injected
 * CSS (`hub-ui` dock, `json-render-ui` renderer module) — the Vite-served SPAs
 * own their whole document and need no rename.
 */
export function namespaceShadowCssVars(css: string): string {
  return css.replaceAll('--un-', '--dfun-')
}

export const shadowSurfaceSafelist: string[] = [
  'bg-base',
  'bg-secondary',
  'bg-active',
  'bg-hover',
  'color-base',
  'color-muted',
  'color-faint',
  'color-active',
  'border-base',
]
