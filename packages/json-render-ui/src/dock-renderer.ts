import type { JsonRenderViewRef, Spec } from '@devframes/json-render'
import type { ComponentRegistry } from '@json-render/vue'
import type { ActionBridgeRpc } from './action-bridge'
import { createApp, h, shallowRef } from 'vue'
import { baseRegistry } from './registry'
import { JsonRenderView } from './renderer'

/**
 * The mount options the hub client host hands a renderer. Declared
 * structurally here so `@devframes/json-render-ui` needs no dependency on
 * `@devframes/hub` — the returned factory is still assignable to the hub's
 * `DockRenderer` at the host's registration site.
 */
export interface JsonRenderDockMountOptions {
  entry: unknown
  container: HTMLElement

  context: { rpc: any }
}

/** A hub-compatible dock renderer. */
export type JsonRenderDockRenderer = (
  options: JsonRenderDockMountOptions,
) => Promise<{ dispose?: () => void }>

export interface JsonRenderDockRendererOptions {
  /** Registry to render with. Defaults to the base registry. */
  registry?: ComponentRegistry
}

/**
 * Build a hub dock renderer for `'json-render'` entries. Register it at
 * `createDevframeClientHost` boot:
 *
 * ```ts
 * createDevframeClientHost({
 *   renderers: { 'json-render': createJsonRenderDockRenderer() },
 * })
 * ```
 *
 * It subscribes to the view's shared state (`entry.view.stateKey`), mounts a
 * Vue app rendering {@link JsonRenderView}, and disposes cleanly — unmounting
 * the app and unsubscribing the shared-state listener — when the dock
 * deactivates (the client host drives that).
 */
export function createJsonRenderDockRenderer(
  options: JsonRenderDockRendererOptions = {},
): JsonRenderDockRenderer {
  const registry = options.registry ?? baseRegistry
  return async ({ entry, container, context }) => {
    const view = (entry as { view: JsonRenderViewRef }).view
    const rpc = context.rpc
    const interactive = rpc.connectionMeta?.backend !== 'static'
    const state = await rpc.sharedState.get(view.stateKey, { initialValue: null })

    const specRef = shallowRef<Spec | null>(state.value() as Spec | null)
    const off = state.on('updated', () => {
      specRef.value = state.value() as Spec | null
    })

    const app = createApp({
      render: () => h(JsonRenderView, {
        spec: specRef.value,
        rpc: rpc as ActionBridgeRpc,
        registry,
        viewId: view.stateKey,
        upstreamVersion: view.upstreamVersion,
        interactive,
      }),
    })
    app.mount(container)

    return {
      dispose() {
        off()
        app.unmount()
      },
    }
  }
}
