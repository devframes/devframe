'use client'

import type { JsonRenderViewRef, Spec } from '@devframes/json-render'
import type { JsonRenderDockRenderer } from '@devframes/json-render/hub'
import type { ComponentRegistry } from '@json-render/react'
import type { ReactNode } from 'react'
import { basePropSchemas } from '@devframes/json-render'
import { JSONUIProvider, Renderer } from '@json-render/react'
import { useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { baseReactRegistry, ERROR_COMPONENT_TYPE } from './registry'

// Built-ins handled inside upstream's ActionProvider — never bridged to RPC.
const RESERVED = new Set(['setState', 'pushState', 'removeState', 'validateForm', 'then', 'catch', 'finally'])

/**
 * The unrestricted action bridge: a spec action name is dispatched as an RPC
 * call of the same name (per the plan). Upstream tracks per-action loading and
 * confirmation; failures rethrow so `onError` handlers fire.
 */
function createActionBridge(rpc: { call: (method: string, ...args: unknown[]) => Promise<unknown> }): Record<string, (params?: Record<string, unknown>) => Promise<unknown>> {
  const cache = new Map<string, (params?: Record<string, unknown>) => Promise<unknown>>()
  return new Proxy({} as Record<string, (params?: Record<string, unknown>) => Promise<unknown>>, {
    has: (_t, p) => typeof p === 'string' && !RESERVED.has(p),
    get: (_t, prop) => {
      if (typeof prop !== 'string' || RESERVED.has(prop))
        return undefined
      let fn = cache.get(prop)
      if (!fn) {
        fn = (params?: Record<string, unknown>) => rpc.call(prop, params)
        cache.set(prop, fn)
      }
      return fn
    },
  })
}

/**
 * Render-time prop validation: swap any element with invalid props for the
 * error component, isolating one bad element instead of breaking the view.
 */
function sanitizeSpec(spec: Spec): Spec {
  let changed = false
  const elements: Spec['elements'] = {}
  for (const [key, element] of Object.entries(spec.elements ?? {})) {
    const schema = basePropSchemas[element.type as keyof typeof basePropSchemas]
    if (schema) {
      const result = schema.safeParse(element.props ?? {})
      if (!result.success) {
        changed = true
        const issues = result.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
        console.warn(`[example:next-devframe-hub] invalid props on element "${key}" (${element.type}): ${issues}`)
        elements[key] = { ...element, type: ERROR_COMPONENT_TYPE, props: { message: `${element.type}: ${issues}` } }
        continue
      }
    }
    elements[key] = element
  }
  return changed ? { ...spec, elements } : spec
}

interface JsonRenderViewProps {
  spec: Spec | null
  rpc: { call: (method: string, ...args: unknown[]) => Promise<unknown> }
  registry: ComponentRegistry
  viewId: string
}

function JsonRenderView({ spec, rpc, registry, viewId }: JsonRenderViewProps): ReactNode {
  const handlers = useMemo(() => createActionBridge(rpc), [rpc])
  const effective = useMemo(() => (spec ? sanitizeSpec(spec) : null), [spec])
  if (!spec)
    return <div className="p4 color-faint text-sm">No view to render.</div>
  return (
    <JSONUIProvider
      // Reset the provider (reseed state) only on identity change.
      key={viewId}
      registry={registry}
      handlers={handlers}
      initialState={spec.state ?? {}}
    >
      <Renderer spec={effective} registry={registry} />
    </JSONUIProvider>
  )
}

/**
 * A dock renderer implementing the `JsonRenderDockRenderer` contract from
 * `@devframes/json-render/hub` — this example's mini **React** registry
 * replacing the Vue reference frontend, exactly the seam a community
 * implementation uses. Mounts a React root into the container the client host
 * provides. For a shared-state view it subscribes to the live spec; for an
 * inline view (`entry.view.spec`) it renders the embedded spec directly, with
 * no shared-state round-trip. Disposes cleanly either way.
 */
export function createReactJsonRenderDockRenderer(): JsonRenderDockRenderer {
  return async ({ entry, container, context }) => {
    const view: JsonRenderViewRef = entry.view
    const { rpc } = context
    // The action bridge only needs a loose `call(method, …)` — the client's
    // typed `DevframeRpcClient` narrows `method` to known keys, so widen it at
    // the prop boundary for the dynamic spec-action names.
    const bridgeRpc = rpc as unknown as JsonRenderViewProps['rpc']
    const viewId = 'stateKey' in view ? view.stateKey : entry.id
    const root = createRoot(container)

    // Inline view: render the embedded spec once, no shared state involved.
    if ('spec' in view) {
      root.render(
        <JsonRenderView spec={view.spec} rpc={bridgeRpc} registry={baseReactRegistry} viewId={viewId} />,
      )
      return {
        dispose() {
          root.unmount()
        },
      }
    }

    const state = await rpc.sharedState.get<Spec>(view.stateKey, { initialValue: null as unknown as Spec })
    const render = (): void => {
      root.render(
        <JsonRenderView
          spec={state.value() as Spec | null}
          rpc={bridgeRpc}
          registry={baseReactRegistry}
          viewId={viewId}
        />,
      )
    }
    render()
    const off = state.on('updated', render)
    return {
      dispose() {
        off()
        root.unmount()
      },
    }
  }
}
