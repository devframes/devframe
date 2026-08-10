/**
 * A view provider renders a dock view *type* (e.g. `json-render`) in a
 * swappable iframe SPA, decoupling the renderer from the hub UI's framework.
 * The hub mounts each provider's SPA and publishes this map as read-only shared
 * state (`VIEW_PROVIDERS_STATE_KEY`); a UI resolves a dock's `type` to the
 * provider `base`, mounts an iframe there, and shows a placeholder when a type
 * has no provider.
 */

/** Metadata a hub publishes for one registered view provider. */
export interface DevframeViewProviderMeta {
  /** Base URL the provider SPA is served at — point an iframe here. */
  base: string
}

/** Map of dock view `type` → its registered iframe view provider. */
export type DevframeViewProviders = Record<string, DevframeViewProviderMeta>
