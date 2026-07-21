import type { Spec } from '@devframes/json-render'
import type { ComponentRegistry } from '@json-render/vue'
import type { Component, PropType } from 'vue'
import type { ActionBridgeRpc } from './action-bridge'
import { basePropSchemas, JSON_RENDER_UPSTREAM_VERSION } from '@devframes/json-render'
import { JSONUIProvider, Renderer } from '@json-render/vue'
import { computed, defineComponent, h, watch } from 'vue'
import { createActionBridge } from './action-bridge'
import { baseRegistry, ERROR_COMPONENT_TYPE } from './registry'

// Upstream ships these as heavily-typed `DefineComponent`s; render them through
// a loose alias so `h()` doesn't demand their full public-instance surface.

const ProviderC = JSONUIProvider as any

const RendererC = Renderer as any

/**
 * Render-time prop validation: parse every element's props against the base
 * catalog schema and swap any element that fails for the reserved error
 * component, so one bad element is isolated instead of breaking the view.
 * Returns the effective spec (unchanged when everything validates).
 */
export function sanitizeSpec(spec: Spec): Spec {
  let changed = false
  const elements: Spec['elements'] = {}
  for (const [key, element] of Object.entries(spec.elements ?? {})) {
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
 * identity or upstream version changes, and preserved across ordinary
 * spec/state updates.
 */
export const JsonRenderView = defineComponent({
  name: 'JsonRenderView',
  props: {
    spec: { type: Object as PropType<Spec | null>, default: null },
    rpc: { type: Object as PropType<ActionBridgeRpc>, required: true },
    registry: { type: Object as PropType<ComponentRegistry>, default: () => baseRegistry },
    viewId: { type: String, default: 'default' },
    upstreamVersion: { type: String, default: undefined },
    interactive: { type: Boolean, default: true },
    loading: { type: Boolean, default: false },
    connectionError: { type: String as PropType<string | null>, default: null },
  },
  setup(props) {
    const bridge = createActionBridge(props.rpc, { interactive: props.interactive })

    // A renderer/upstream-version mismatch warns rather than blocking.
    watch(
      () => props.upstreamVersion,
      (version) => {
        if (version && version !== JSON_RENDER_UPSTREAM_VERSION) {
          console.warn(
            `[@devframes/json-render-ui] view "${props.viewId}" was authored against @json-render ${version}, `
            + `but this renderer bundles ${JSON_RENDER_UPSTREAM_VERSION}. Rendering anyway.`,
          )
        }
      },
      { immediate: true },
    )

    // Reset the provider (reseed state) only on identity / version change.
    const resetKey = computed(() => `${props.viewId}::${props.upstreamVersion ?? JSON_RENDER_UPSTREAM_VERSION}`)
    const effectiveSpec = computed(() => (props.spec ? sanitizeSpec(props.spec) : null))

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
