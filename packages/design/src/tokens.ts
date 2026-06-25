/**
 * The devframe design tokens.
 *
 * Token *values* (the actual colors, light + dark) live in `theme.css` as
 * `--df-*` custom properties so any consumer — UnoCSS, plain CSS, or a foreign
 * framework — reads one source of truth. This module is the JavaScript-facing
 * mirror: it maps each semantic token to its `var(--df-*)` reference so the
 * UnoCSS preset can expose utilities (`bg-primary`, `text-muted-foreground`, …)
 * that resolve to the same variables and flip with the `.dark` class.
 */

/** Prefix for every design-system CSS custom property. */
export const TOKEN_PREFIX = '--df-'

/** A `var(--df-<name>)` reference for a semantic token. */
export function cssVar(name: string): string {
  return `var(${TOKEN_PREFIX}${name})`
}

/** Semantic colors that come in surface/`-foreground` pairs. */
export const PAIRED_TOKENS = [
  'primary',
  'secondary',
  'muted',
  'accent',
  'card',
  'popover',
  'destructive',
  'success',
  'warning',
] as const

/** Single-value semantic colors (no paired foreground). */
export const SOLO_TOKENS = [
  'background',
  'foreground',
  'border',
  'input',
  'ring',
] as const

export type PairedToken = (typeof PAIRED_TOKENS)[number]
export type SoloToken = (typeof SOLO_TOKENS)[number]
export type DesignToken = PairedToken | SoloToken | `${PairedToken}-foreground`

/**
 * The UnoCSS `theme.colors` object. Every entry resolves to a `--df-*`
 * variable, so the same semantic utility renders identically across plugins
 * and switches theme via the `.dark` class on a common ancestor.
 */
export const tokenColors: Record<string, string | Record<string, string>> = {
  ...Object.fromEntries(SOLO_TOKENS.map(name => [name, cssVar(name)])),
  ...Object.fromEntries(
    PAIRED_TOKENS.map(name => [
      name,
      { DEFAULT: cssVar(name), foreground: cssVar(`${name}-foreground`) },
    ]),
  ),
}

/**
 * Corner radii, derived from a single `0.625rem` base (matching the flagship
 * dashboard). Emitted by UnoCSS as `--radius-*`, referenced by `rounded-*`.
 */
export const radius = {
  DEFAULT: '0.625rem',
  sm: 'calc(0.625rem - 4px)',
  md: 'calc(0.625rem - 2px)',
  lg: '0.625rem',
  xl: 'calc(0.625rem + 4px)',
} as const
