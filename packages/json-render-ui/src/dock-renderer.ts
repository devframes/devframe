import type { JsonRenderViewRef, Spec } from '@devframes/json-render'
import type { JsonRenderDockRenderer } from '@devframes/json-render/hub'
import type { ComponentRegistry } from '@json-render/vue'
import type { ActionBridgeRpc } from './action-bridge'
import { createApp, h, shallowRef } from 'vue'
import { baseRegistry } from './registry'
import { JsonRenderView } from './renderer'

export type { JsonRenderDockMountOptions, JsonRenderDockRenderer } from '@devframes/json-render/hub'

export interface JsonRenderDockRendererOptions {
  /** Registry to render with. Defaults to the base registry. */
  registry?: ComponentRegistry
}

/**
 * Build a hub dock renderer for `'json-render'` entries. Register it at
 * `createDevframeClientRuntime` boot:
 *
 * ```ts
 * createDevframeClientRuntime({
 *   renderers: { 'json-render': createJsonRenderDockRenderer() },
 * })
 * ```
 *
 * For a shared-state view (`entry.view.stateKey`) it subscribes to the live
 * spec and re-renders on every update; for an inline view (`entry.view.spec`)
 * it renders the embedded spec directly, with no shared-state round-trip - the
 * path a client-synthesized view takes. Either way it mounts a Vue app
 * rendering {@link JsonRenderView} and disposes cleanly - unmounting the app and
 * unsubscribing any shared-state listener - when the dock deactivates (the
 * client host drives that).
 */
export function createJsonRenderDockRenderer(
  options: JsonRenderDockRendererOptions = {},
): JsonRenderDockRenderer {
  const registry = options.registry ?? baseRegistry
  return async ({ entry, container, context }) => {
    const view: JsonRenderViewRef = entry.view
    const rpc = context.rpc
    const interactive = rpc.connectionMeta?.backend !== 'static'
    const viewId = 'stateKey' in view ? view.stateKey : entry.id

    // Inline view: render the embedded spec as-is; shared-state view: subscribe
    // to the live spec and track updates through `specRef`.
    const specRef = shallowRef<Spec | null>('spec' in view ? view.spec : null)
    let off: (() => void) | undefined
    if ('stateKey' in view) {
      const state = await rpc.sharedState.get<Spec>(view.stateKey)
      specRef.value = state.value() as Spec | null
      off = state.on('updated', () => {
        specRef.value = state.value() as Spec | null
      })
    }

    const app = createApp({
      render: () => h(JsonRenderView, {
        spec: specRef.value,
        rpc: rpc as ActionBridgeRpc,
        registry,
        viewId,
        interactive,
      }),
    })
    app.mount(container)

    return {
      dispose() {
        off?.()
        app.unmount()
      },
    }
  }
}
