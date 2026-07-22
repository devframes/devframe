'use client'

import type { JsonRenderViewRef, Spec } from '@devframes/json-render'
import type { ComponentRegistry } from '@json-render/react'
import type { ReactNode } from 'react'
import { basePropSchemas, JSON_RENDER_UPSTREAM_VERSION } from '@devframes/json-render'
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
        console.warn(`[minimal-next-devframe-hub] invalid props on element "${key}" (${element.type}): ${issues}`)
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
  upstreamVersion?: string
}

function JsonRenderView({ spec, rpc, registry, viewId, upstreamVersion }: JsonRenderViewProps): ReactNode {
  const handlers = useMemo(() => createActionBridge(rpc), [rpc])
  const effective = useMemo(() => (spec ? sanitizeSpec(spec) : null), [spec])
  if (!spec)
    return <div className="p4 color-faint text-sm">No view to render.</div>
  return (
    <JSONUIProvider
      // Reset the provider (reseed state) only on identity/version change.
      key={`${viewId}::${upstreamVersion ?? JSON_RENDER_UPSTREAM_VERSION}`}
      registry={registry}
      handlers={handlers}
      initialState={spec.state ?? {}}
    >
      <Renderer spec={effective} registry={registry} />
    </JSONUIProvider>
  )
}

export interface ReactDockMountOptions {
  entry: unknown
  container: HTMLElement

  context: { rpc: any }
}

/**
 * A hub-compatible dock renderer that renders a `json-render` dock with this
 * example's mini **React** registry (registry replacement) instead of the Vue
 * reference frontend. Mounts a React root into the container the client host
 * provides, subscribes to the view's shared state, and disposes cleanly.
 */
export function createReactJsonRenderDockRenderer() {
  return async ({ entry, container, context }: ReactDockMountOptions): Promise<{ dispose: () => void }> => {
    const view = (entry as { view: JsonRenderViewRef }).view
    const rpc = context.rpc
    const state = await rpc.sharedState.get(view.stateKey, { initialValue: null })
    const root = createRoot(container)
    const render = (): void => {
      root.render(
        <JsonRenderView
          spec={state.value() as Spec | null}
          rpc={rpc}
          registry={baseReactRegistry}
          viewId={view.stateKey}
          upstreamVersion={view.upstreamVersion}
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
