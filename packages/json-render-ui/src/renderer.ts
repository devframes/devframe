import type { Spec } from '@devframes/json-render'
import type { ComponentRegistry } from '@json-render/vue'
import type { Component, PropType } from 'vue'
import type { ActionBridgeRpc } from './action-bridge'
import { basePropSchemas } from '@devframes/json-render'
import { JSONUIProvider, Renderer } from '@json-render/vue'
import { computed, defineComponent, h } from 'vue'
import { createActionBridge } from './action-bridge'
import { baseRegistry, ERROR_COMPONENT_TYPE, UNSUPPORTED_COMPONENT_TYPE } from './registry'

// Upstream ships these as heavily-typed `DefineComponent`s; render them through
// a loose alias so `h()` doesn't demand their full public-instance surface.

const ProviderC = JSONUIProvider as any

const RendererC = Renderer as any

/**
 * Render-time isolation, parameterized by the active registry:
 *
 * - An element whose `type` is **not in the registry** (a component this
 *   frontend does not support) is swapped for the reserved *unsupported*
 *   placeholder, which shows the type and a gist of its prop keys. The rest of
 *   the view still renders.
 * - An element whose props fail the base-catalog schema is swapped for the
 *   reserved *error* placeholder, so one bad element is isolated.
 *
 * Both cases emit a `console.warn` (browser-only failures keep `console.*` per
 * the plan; no coded diagnostic). Returns the effective spec (unchanged when
 * every element renders cleanly).
 */
export function sanitizeSpec(spec: Spec, registry: ComponentRegistry = baseRegistry): Spec {
  let changed = false
  const elements: Spec['elements'] = {}
  for (const [key, element] of Object.entries(spec.elements ?? {})) {
    // Unsupported component: the active registry has no renderer for it.
    if (!(element.type in registry)) {
      changed = true
      const keys = Object.keys(element.props ?? {})
      // Browser-only render failure — keep console.* per the plan.
      console.warn(`[@devframes/json-render-ui] unsupported component "${element.type}" on element "${key}": not in the active registry. Rendering a placeholder.`)
      elements[key] = { ...element, type: UNSUPPORTED_COMPONENT_TYPE, props: { type: element.type, keys } }
      continue
    }
    const schema = basePropSchemas[element.type as keyof typeof basePropSchemas]
    if (schema) {
      const result = schema.safeParse(element.props ?? {})
      if (!result.success) {
        changed = true
        const issues = result.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
        // Browser-only render failure — keep console.* per the plan.
        console.warn(`[@devframes/json-render-ui] invalid props on element "${key}" (${element.type}): ${issues}`)
        elements[key] = { ...element, type: ERROR_COMPONENT_TYPE, props: { message: `${element.type}: ${issues}` } }
        continue
      }
    }
    elements[key] = element
  }
  return changed ? { ...spec, elements } : spec
}

const surface = 'flex items-center justify-center p4 text-sm color-faint'

/**
 * The reference renderer shell. Wires upstream `JSONUIProvider` + `Renderer`
 * with the unrestricted {@link createActionBridge action bridge}, seeds
 * `spec.state`, isolates invalid elements, surfaces action errors, and owns
 * reset semantics: the provider is remounted (state reseeded) when the view
 * identity changes, and preserved across ordinary spec/state updates.
 */
export const JsonRenderView = defineComponent({
  name: 'JsonRenderView',
  props: {
    spec: { type: Object as PropType<Spec | null>, default: null },
    rpc: { type: Object as PropType<ActionBridgeRpc>, required: true },
    registry: { type: Object as PropType<ComponentRegistry>, default: () => baseRegistry },
    viewId: { type: String, default: 'default' },
    interactive: { type: Boolean, default: true },
    loading: { type: Boolean, default: false },
    connectionError: { type: String as PropType<string | null>, default: null },
  },
  setup(props) {
    const bridge = createActionBridge(props.rpc, { interactive: props.interactive })

    // Reset the provider (reseed state) only on identity change.
    const resetKey = computed(() => props.viewId)
    const effectiveSpec = computed(() => (props.spec ? sanitizeSpec(props.spec, props.registry) : null))

    return () => {
      if (props.loading)
        return h('div', { class: surface }, 'Loading…')
      if (props.connectionError)
        return h('div', { class: `${surface} color-red` }, props.connectionError)
      if (!props.spec)
        return h('div', { class: surface }, 'No view to render.')

      const banner = bridge.error.value
        ? h('div', {
            class: 'rounded border border-red bg-red:10 color-red text-xs px2 py1 mb2',
            role: 'alert',
          }, `Action "${bridge.error.value.action}" failed: ${String((bridge.error.value.error as Error)?.message ?? bridge.error.value.error)}`)
        : null

      const staticNote = !props.interactive
        ? h('div', {
            class: 'rounded border border-base bg-secondary color-faint text-xs px2 py1 mb2',
          }, 'Interactive actions are unavailable in static output.')
        : null

      return h('div', { class: 'color-base' }, [
        staticNote,
        banner,
        h(
          ProviderC,
          {
            key: resetKey.value,
            registry: props.registry,
            handlers: bridge.handlers,
            initialState: props.spec.state ?? {},
          },
          {
            default: () => h(RendererC, { spec: effectiveSpec.value, registry: props.registry }),
          },
        ),
      ])
    }
  },
})

/** Options for {@link createRenderer}. */
export interface CreateRendererOptions {
  /** Component registry to render with. Defaults to the base registry. */
  registry?: ComponentRegistry
}

/**
 * Create a configured renderer component bound to a registry. The returned
 * component is {@link JsonRenderView} with the registry defaulted, so a host
 * can `createRenderer({ registry: myRegistry })` to swap the whole registry.
 */
export function createRenderer(options: CreateRendererOptions = {}) {
  const registry = options.registry ?? baseRegistry
  return defineComponent({
    name: 'ConfiguredJsonRenderView',
    inheritAttrs: false,
    setup(_props, { attrs }) {
      // Default the registry; every other prop flows through via attrs.
      return () => h(JsonRenderView as unknown as Component, { registry, ...attrs })
    },
  })
}
