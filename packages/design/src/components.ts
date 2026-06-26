/**
 * Shared component recipes.
 *
 * These framework-neutral builders are the devframe "components": each returns
 * the canonical `df-*` class string for an element, so React (`className=`),
 * Svelte (`class=`) and vanilla DOM (`el.className =`) all describe the same
 * button, panel, tab or nav the same way and render identically.
 *
 * Because the class strings are assembled at runtime, the `df-*` vocabulary is
 * safelisted by the preset (see {@link DF_SAFELIST}) so UnoCSS always emits it
 * regardless of static extraction.
 */

/** Join truthy class fragments into a single class string. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * Buttons come in exactly three forms, and every plugin and example sticks to
 * them so controls read the same across frameworks:
 *
 * 1. **Text button** — a label (optionally with a leading icon). {@link button}.
 * 2. **Icon button** — a square, icon-only control with a border. `iconButton()`.
 * 3. **Borderless icon button** — the same square control without the border,
 *    for dense toolbars. `iconButton({ variant: 'ghost' })`.
 *
 * Text buttons carry a color variant; icon buttons are deliberately limited to
 * the bordered/borderless pair (color via a class when truly needed).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'
export type ButtonSize = 'md' | 'sm' | 'lg'

export interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Extra classes appended after the recipe. */
  class?: string
}

/** A text button — `df-btn` + a color variant, optionally a non-default size. */
export function button({ variant = 'primary', size = 'md', class: extra }: ButtonProps = {}): string {
  return cx('df-btn', `df-btn-${variant}`, size !== 'md' && `df-btn-${size}`, extra)
}

/** The two icon-only forms: `outline` (bordered) and `ghost` (borderless). */
export type IconButtonVariant = 'outline' | 'ghost'
export type IconButtonSize = 'md' | 'sm'

export interface IconButtonProps {
  /** `outline` (default) = icon button; `ghost` = borderless icon button. */
  variant?: IconButtonVariant
  size?: IconButtonSize
  class?: string
}

/** A square, icon-only button — bordered by default, borderless when `ghost`. */
export function iconButton({ variant = 'outline', size = 'md', class: extra }: IconButtonProps = {}): string {
  return cx('df-btn', `df-btn-${variant}`, size === 'sm' ? 'df-btn-icon-sm' : 'df-btn-icon', extra)
}

export type BadgeVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'

export interface BadgeProps {
  variant?: BadgeVariant
  class?: string
}

/** A solid/semantic badge (the variant class already includes the `df-badge` base). */
export function badge({ variant = 'secondary', class: extra }: BadgeProps = {}): string {
  return cx(`df-badge-${variant}`, extra)
}

/** A soft, palette-driven tag (`df-tag-blue`, `df-tag-amber`, …). */
export function tag(color: string, extra?: string): string {
  return cx(`df-tag-${color}`, extra)
}

/** The container for the segmented view switcher (sits inside the top `df-nav`). */
export function tabsList(extra?: string): string {
  return cx('df-tabs-list', extra)
}

/**
 * A segmented tab. Active state is driven by `data-state="active"` on the
 * element, so it works with Radix and with plain buttons alike. Each tab pairs
 * a leading `i-ph-*` icon with its label.
 */
export function tab(extra?: string): string {
  return cx('df-tab', extra)
}

export interface NavTabProps {
  active?: boolean
  class?: string
}

/** A closeable navigation tab (terminal sessions, open documents, …). */
export function navTab({ active = false, class: extra }: NavTabProps = {}): string {
  return cx('df-navtab', active && 'df-navtab-active', extra)
}

/** A top navigation bar. */
export function nav(extra?: string): string {
  return cx('df-nav', extra)
}

/** The leading brand block inside a `nav` — a primary-tinted icon + the name. */
export function navBrand(extra?: string): string {
  return cx('df-nav-brand', extra)
}

/** A secondary toolbar bar. */
export function toolbar(extra?: string): string {
  return cx('df-toolbar', extra)
}

/** A card surface. */
export function card(extra?: string): string {
  return cx('df-card', extra)
}

/** A flat panel surface. */
export function panel(extra?: string): string {
  return cx('df-panel', extra)
}

/** A text input / textarea. */
export function input(extra?: string): string {
  return cx('df-input', extra)
}

/** An inline link. */
export function link(extra?: string): string {
  return cx('df-link', extra)
}

export type DotState = 'running' | 'idle' | 'error'

/** A status dot for a lifecycle state. */
export function dot(state: DotState, extra?: string): string {
  return cx('df-dot', `df-dot-${state}`, extra)
}

/** An indeterminate spinner. */
export function spinner(extra?: string): string {
  return cx('df-spinner', extra)
}

/**
 * The full fixed `df-*` vocabulary. The preset safelists this so the runtime
 * builders above always have CSS to resolve to, even though their class strings
 * never appear literally in scanned source. A representative set of palette
 * tags is included for {@link tag}.
 */
export const DF_SAFELIST: string[] = [
  // buttons
  'df-btn',
  'df-btn-primary',
  'df-btn-secondary',
  'df-btn-outline',
  'df-btn-ghost',
  'df-btn-destructive',
  'df-btn-link',
  'df-btn-sm',
  'df-btn-lg',
  'df-btn-icon',
  'df-btn-icon-sm',
  // badges
  'df-badge',
  'df-badge-primary',
  'df-badge-secondary',
  'df-badge-success',
  'df-badge-warning',
  'df-badge-destructive',
  'df-badge-outline',
  // tabs + bars
  'df-tabs-list',
  'df-tab',
  'df-navtab',
  'df-navtab-active',
  'df-nav',
  'df-nav-brand',
  'df-toolbar',
  // surfaces + controls
  'df-card',
  'df-panel',
  'df-input',
  'df-link',
  // status
  'df-dot',
  'df-dot-running',
  'df-dot-idle',
  'df-dot-error',
  'df-spinner',
  // common palette tags
  'df-tag-blue',
  'df-tag-amber',
  'df-tag-green',
  'df-tag-red',
  'df-tag-sky',
  'df-tag-violet',
  'df-tag-rose',
]
