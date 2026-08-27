/**
 * Published `createUi()` config types, kept framework-free so the node
 * entry's declaration rollup (`dist/index.d.mts`) never pulls in Vue's type
 * surface. Client modules that need these types import them *from* here
 * (never the reverse) — see `client/state/branding.ts`,
 * `client/embedded/visibility.ts`.
 */

/**
 * A logo asset — a single URL/data-URI, or per-color-scheme variants. The dark
 * variant falls back to the light one when only `light` is given (or a bare
 * string is used for both).
 */
export type BrandingLogo = string | { light: string, dark: string }

/**
 * Consumer-facing branding for the reference hub-ui. Every field is optional
 * and falls back to devframe's own identity. Published as
 * `ConnectionMeta.configs.ui.branding` via `createUi({ branding })`, and
 * read from the one connection handshake the dock already performs —
 * `ConnectionMeta` has its own cross-realm propagation (see
 * `DEVFRAME_CONNECTION_KEY`), so branding needs no globals or query params
 * of its own.
 */
export interface DevframeBranding {
  /** Product name — the wordmark, window titles, and all user-visible copy. */
  productName?: string
  /** Logo mark (URL / data-URI), rendered via `<img>`. */
  logo?: BrandingLogo
  /** Optional standalone wordmark image; when absent, mark + productName text is composed. */
  wordmark?: BrandingLogo
  /** Brand color; feeds `--devframe-primary` and the whole primary ramp. */
  primaryColor?: string
  /** Standalone viewer CSS `background`; a string applies to both color schemes. */
  background?: string | { light: string, dark: string }
  /** Short line for the auth screen and the standalone meta description. */
  tagline?: string
  /** Favicon URL — applied on the standalone viewer and the popped-out window only. */
  favicon?: string
  /** Window/tab title; defaults to `productName`. */
  windowTitle?: string
}

/**
 * The reference UI's dock-bar rendering preferences, set via
 * `createUi({ dockPreferences })` and published as
 * `ConnectionMeta.configs.ui.dockPreferences`. Read by the embedded dock and
 * the standalone viewer at boot.
 *
 * Like the float/edge dock mode, these seed user-overridable state — the
 * config sets the default, the visitor's own choice wins from then on.
 */
export interface DevframeDockPreferences {
  /**
   * The top-level dock-bar **category** ordering — a map of category id →
   * ordering weight (lower sorts earlier), merged beneath
   * `DEFAULT_CATEGORIES_ORDER`.
   */
  categoryOrder?: Record<string, number>
  /**
   * Preferred inline-item capacity for the floating dock bar before entries
   * overflow. Edge mode ignores it — it shows every entry with no cutoff.
   */
  maxVisibleItems?: number
  /** Seeds a first-run visitor's dock mode (float vs edge). */
  defaultMode?: 'float' | 'edge'
  /** Seeds a first-run visitor's dock position. */
  defaultPosition?: 'left' | 'right' | 'top' | 'bottom'
}

/**
 * How the embedded floating dock reveals itself on a fresh page — the
 * reference UI's port of Nuxt DevTools' opt-in overlay, published as
 * `ConnectionMeta.configs.ui.embeddedVisibility` and set via
 * `createUi({ embeddedVisibility })`.
 *
 * - `normal` (default) — the dock is shown immediately.
 * - `passive` — the dock starts hidden and a console hint offers the reveal
 *   shortcut; revealing persists per-origin, so later sessions on this
 *   browser start shown. The "Hide" command returns to passive.
 * - `hidden` — the dock starts hidden and the shortcut reveals it for the
 *   current session only; nothing is persisted.
 *
 * Whatever the policy, the reveal state is a user-overridable preference —
 * the same shape as the float/edge dock mode: the config seeds it, the
 * visitor's own reveal/hide wins from then on.
 */
export type EmbeddedVisibility = 'normal' | 'passive' | 'hidden'
