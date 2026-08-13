import type {
  DevframeClientContext,
  DockRendererManifest,
  DockRenderersContext,
  DocksContext,
} from '@devframes/hub/client'
import { createDockRenderersContext } from '@devframes/hub/client'

/**
 * The client-side dock-renderer registry required by the hub's `DocksContext`.
 * Delegates to the hub's shared factory, so local-first resolution, lazy
 * imports from the hub's renderer manifest (`initHub({ renderers })` →
 * the `devframe:dock-renderers` shared-state slot), and the typed mount
 * result behave exactly like `createDevframeClientHost`'s registry.
 *
 * hub-ui renders its native dock types directly in `ViewEntry.vue`; every
 * other type routes through this registry via `ViewDockRenderer.vue` — e.g. a
 * `'json-render'` dock renders with whatever implementation the host
 * composed (`jsonRenderUiRenderer()` from `@devframes/json-render-ui/hub`,
 * or any community renderer), and falls back to the missing-renderer view
 * when none is present.
 */
export function createDockRenderers(
  getContext: () => DocksContext,
  manifest: () => DockRendererManifest,
): DockRenderersContext {
  return createDockRenderersContext({
    context: () => getContext() as DevframeClientContext,
    manifest,
  })
}
