/**
 * Published `createUi()` config types, kept framework-free so the node
 * entry's declaration rollup (`dist/index.d.mts`) never pulls in Vue's type
 * surface. Client modules that need these types import them *from* here
 * (never the reverse); see `client/state/branding.ts`,
 * `client/embedded/visibility.ts`.
 *
 * The node entry must also stay off the client graph for another reason: the
 * client types register optional peer packages (`@devframes/json-render`) by
 * side-effect import, and a declaration file that references one of those
 * makes TS2882 fire for a consumer that never installed it.
 */
import type { DevframeDocksUserSettings } from '@devframes/hub/types'

/**
 * A logo asset: a single URL/data-URI, or per-color-scheme variants. The dark
 * variant falls back to the light one when only `light` is given (or a bare
 * string is used for both).
 */
export type BrandingLogo = string | { light: string, dark: string }

/** A value that can vary with the viewer color scheme. */
export type ColorSchemeValue = string | { light: string, dark: string }

/**
 * The standalone viewer background. The flat form applies in every context;
 * the structured form may provide an iframe-specific value.
 */
export type ViewerBackground = ColorSchemeValue | {
  standalone: ColorSchemeValue
  iframe?: ColorSchemeValue
}

/**
 * Consumer-facing branding for the reference hub-ui. Every field is optional
 * and falls back to devframe's own identity. Published as
 * `ConnectionMeta.configs.ui.branding` via `createUi({ branding })`, and
 * read from the one connection handshake the dock already performs;
 * `ConnectionMeta` has its own cross-realm propagation (see
 * `DEVFRAME_CONNECTION_KEY`), so branding needs no globals or query params
 * of its own.
 */
export interface DevframeBranding {
  /** Product name: the wordmark, window titles, and all user-visible copy. */
  productName?: string
  /** Logo mark (URL / data-URI), rendered via `<img>`. */
  logo?: BrandingLogo
  /** Optional standalone wordmark image; when absent, mark + productName text is composed. */
  wordmark?: BrandingLogo
  /** Brand color; feeds `--devframe-primary` and the whole primary ramp. */
  primaryColor?: string
  /** Standalone viewer CSS `background`, optionally specialized for iframe use. */
  background?: ViewerBackground
  /** Short line for the auth screen and the standalone meta description. */
  tagline?: string
  /** Favicon URL, applied on the standalone viewer and the popped-out window only. */
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
 * Like the float/edge dock mode, these seed user-overridable state; the
 * config sets the default, the visitor's own choice wins from then on.
 */
export interface DevframeDockPreferences {
  /**
   * The top-level dock-bar **category** ordering: a map of category id →
   * ordering weight (lower sorts earlier), merged beneath
   * `DEFAULT_CATEGORIES_ORDER`.
   */
  categoryOrder?: Record<string, number>
  /**
   * Preferred inline-item capacity for the floating dock bar before entries
   * overflow. Edge mode ignores it; it shows every entry with no cutoff.
   */
  maxVisibleItems?: number
  /** Seeds a first-run visitor's dock mode (float vs edge). */
  defaultMode?: 'float' | 'edge'
  /** Seeds a first-run visitor's dock position. */
  defaultPosition?: 'left' | 'right' | 'top' | 'bottom'
}

/**
 * How the embedded floating dock reveals itself on a fresh page: the
 * reference UI's port of Nuxt DevTools' opt-in overlay, published as
 * `ConnectionMeta.configs.ui.embeddedVisibility` and set via
 * `createUi({ embeddedVisibility })`.
 *
 * - `normal` (default): the dock is shown immediately.
 * - `passive`: the dock starts hidden and a console hint offers the reveal
 *   shortcut; revealing persists per-origin, so later sessions on this
 *   browser start shown. The "Hide" command returns to passive.
 * - `hidden`: the dock starts hidden and the shortcut reveals it for the
 *   current session only; nothing is persisted.
 *
 * Whatever the policy, the reveal state is a user-overridable preference,
 * the same shape as the float/edge dock mode: the config seeds it, the
 * visitor's own reveal/hide wins from then on.
 */
export type EmbeddedVisibility = 'normal' | 'passive' | 'hidden'

/**
 * hub-ui's own reference-UI settings, merged onto the hub's generic
 * {@link DevframeDocksUserSettings}; the hub core stays unaware of them.
 * Every field is optional so the hub's `DEFAULT_STATE_USER_SETTINGS()` (which
 * knows nothing about them) stays assignable; what an absent value means lives
 * in one place, `HUB_UI_SETTINGS_DEFAULTS` (`client/state/settings-defaults.ts`),
 * merged in once by `useSettings()` so readers see resolved values rather than
 * repeating a per-call-site fallback.
 *
 * Lives here, not in `client/types.ts`, so the published `createUi()` types can
 * name these fields without the node entry importing the client graph.
 */
declare module '@devframes/hub/types' {
  interface DevframeDocksUserSettings {
    /** Show the address-bar chrome on iframe dock views. */
    showIframeAddressBar?: boolean
    /** Close the floating dock panel when clicking outside it. */
    closeOnOutsideClick?: boolean
    /**
     * Auto-collapse the edge-mode toolbar to a small handle when idle (no
     * hover or drag) and the panel content is closed, instead of permanently
     * spanning the full edge.
     */
    autoCollapseEdgeToolbar?: boolean
    /**
     * Reveal the Devframe Inspector dock (the "devtools for the devtools"
     * meta-introspection panel) on the dock bar. Users opt in from
     * Settings → Advanced.
     */
    showDevframeInspector?: boolean
    /**
     * How many recently opened docks the float bar keeps in their own slots
     * after its visible items. Only docks opened from beyond the bar (the
     * overflow popover or a group popover) take a slot. `0` turns the slots
     * off.
     */
    docksRecentLimit?: number
    /**
     * Widen the group sidebar so each member shows its title next to its
     * icon, instead of an icon-only rail with hover tooltips.
     */
    expandGroupSidebar?: boolean
  }
}

/**
 * The user-settings seed a host publishes through
 * `createUi({ settingsDefaults })` → `ConnectionMeta.configs.ui.settingsDefaults`.
 *
 * Every field is optional: a seed names only what the project wants to differ
 * from the built-in defaults, and whatever it leaves out keeps falling back.
 *
 * The three list fields (`docksHidden`, `docksCategoriesHidden`, `docksPinned`)
 * are left out on purpose. The stored list is always present, so a seeded list
 * would only win by overriding the visitor's forever, and a developer could
 * hide an entry the project seeded while never unhiding one. Records
 * (`commandShortcuts`, `docksCustomOrder`) merge per key instead, so a seeded
 * entry and a stored entry coexist and the stored one wins where they collide.
 */
export type DocksUserSettingsDefaults = Omit<
  Partial<DevframeDocksUserSettings>,
  'docksHidden' | 'docksCategoriesHidden' | 'docksPinned'
>
