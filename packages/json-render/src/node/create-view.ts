import type { DevframeNodeContext, DevframeScopedNodeContext } from 'devframe/types'
import type { SharedState, SharedStatePatch } from 'devframe/utils/shared-state'
import type { DevframeJsonRenderSpec, JsonRenderStatePatch, JsonRenderView } from '../types'
import { createSharedState } from 'devframe/utils/shared-state'
import { basePropSchemas } from '../prop-schemas'
import { JSON_RENDER_UPSTREAM_VERSION } from '../view-ref'
import { diagnostics } from './diagnostics'

/** Options for {@link createJsonRenderView}. */
export interface CreateJsonRenderViewOptions {
  /**
   * Stable, author-supplied id, unique within the view's scope. Forms the
   * shared-state key `devframe:json-render:<scope>:<id>` and never changes
   * across updates, so a client keeps its subscription across reconnects.
   */
  id: string
  /** The initial spec. */
  spec: DevframeJsonRenderSpec
  /**
   * Override the scope segment of the view's stable id. Defaults to the
   * context's namespace when created from a scoped context, otherwise
   * `'global'`.
   */
  scope?: string
}

type AnyContext = DevframeNodeContext | DevframeScopedNodeContext<string>

function isScoped(ctx: AnyContext): ctx is DevframeScopedNodeContext<string> {
  return 'base' in ctx && 'namespace' in ctx
}

// One registry of live view keys per base context, so a duplicate id within a
// scope is caught deterministically (not left to shared-state get() returning
// the pre-existing entry).
const registries = new WeakMap<object, Set<string>>()
function registryFor(ctx: DevframeNodeContext): Set<string> {
  let set = registries.get(ctx)
  if (!set) {
    set = new Set()
    registries.set(ctx, set)
  }
  return set
}

/** Parse an RFC 6901 JSON Pointer into path segments. */
function parsePointer(pointer: string): string[] {
  if (pointer === '' || pointer === '/')
    return []
  return pointer
    .replace(/^\//, '')
    .split('/')
    .map(seg => seg.replace(/~1/g, '/').replace(/~0/g, '~'))
}

function assertJsonSerializable(id: string, spec: DevframeJsonRenderSpec): void {
  try {
    JSON.stringify(spec)
  }
  catch (error) {
    throw diagnostics.DF0041({ id, reason: (error as Error).message })
  }
}

function validateElementProps(id: string, spec: DevframeJsonRenderSpec): void {
  for (const [key, element] of Object.entries(spec.elements ?? {})) {
    const schema = basePropSchemas[element.type as keyof typeof basePropSchemas]
    if (!schema)
      continue
    const result = schema.safeParse(element.props ?? {})
    if (!result.success) {
      const issues = result.error.issues
        .map(i => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')
      throw diagnostics.DF0038({ id, key, issues })
    }
  }
}

// Ensure the spec always carries a `state` object so JSON-Pointer patches
// into `/state/...` have a container to target.
function normalizeSpec(spec: DevframeJsonRenderSpec): DevframeJsonRenderSpec {
  return spec.state ? spec : { ...spec, state: {} }
}

/**
 * Create a JSON-render view bound to a devframe context. Registers a
 * server-side shared state (patches enabled) carrying the live spec + state,
 * validates element props at ingress against the base catalog, and returns a
 * handle plus the serializable {@link JsonRenderView.ref} a client subscribes
 * through.
 *
 * @example
 * ```ts
 * const view = createJsonRenderView(ctx, { id: 'metrics', spec })
 * view.update(nextSpec)
 * view.patchState([{ op: 'replace', path: '/count', value: 3 }])
 * view.dispose()
 * ```
 */
export function createJsonRenderView(
  ctx: AnyContext,
  options: CreateJsonRenderViewOptions,
): JsonRenderView {
  const scoped = isScoped(ctx)
  const baseCtx = scoped ? ctx.base : ctx
  const scope = options.scope ?? (scoped ? ctx.namespace : 'global')
  const { id } = options
  const stateKey = `devframe:json-render:${scope}:${id}`

  const registry = registryFor(baseCtx)
  if (registry.has(stateKey))
    throw diagnostics.DF0039({ id, scope })

  const initial = normalizeSpec(options.spec)
  validateElementProps(id, initial)
  assertJsonSerializable(id, initial)

  const state: SharedState<DevframeJsonRenderSpec> = createSharedState({
    initialValue: initial,
    enablePatches: true,
  })

  registry.add(stateKey)
  // Registering the state on the RPC host is synchronous up to its first
  // await (there is none before the broadcast listener is attached), so
  // subsequent `update`/`patchState` calls broadcast correctly.
  void baseCtx.rpc.sharedState.get(stateKey, { sharedState: state as SharedState<any> })

  let disposed = false
  function assertLive(): void {
    if (disposed)
      throw diagnostics.DF0040({ id })
  }

  return {
    id,
    ref: { stateKey, upstreamVersion: JSON_RENDER_UPSTREAM_VERSION },
    value: () => state.value() as DevframeJsonRenderSpec,
    update(spec) {
      assertLive()
      const next = normalizeSpec(spec)
      validateElementProps(id, next)
      assertJsonSerializable(id, next)
      state.mutate(() => next)
    },
    patchState(patches: JsonRenderStatePatch[]) {
      assertLive()
      const prefixed: SharedStatePatch[] = patches.map(p => ({
        op: p.op,
        path: ['state', ...parsePointer(p.path)],
        value: p.value,
      }))
      state.patch(prefixed)
    },
    dispose() {
      if (disposed)
        return
      disposed = true
      registry.delete(stateKey)
      baseCtx.rpc.sharedState.delete(stateKey)
    },
  }
}
