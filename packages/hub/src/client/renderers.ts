import type { ClientScriptEntry, DevframeDockEntry } from '../types/docks'
import type { DevframeClientContext } from './docks'

/**
 * Options handed to a dock renderer when the client host mounts a dock entry.
 */
export interface DockRendererMountOptions<Entry extends DevframeDockEntry = DevframeDockEntry> {
  /** The dock entry being rendered (carries the entry's serializable payload). */
  entry: Entry
  /**
   * The DOM element the renderer should mount into. It may live inside a
   * **shadow root** (the reference viewer isolates dock content that way), so
   * a renderer must deliver its own styles into `container.getRootNode()`
   * rather than assume a page-level stylesheet. The viewer mirrors a live
   * `dark` class onto this element (the theme contract), and CSS custom
   * properties inherit across the shadow boundary for brand theming.
   */
  container: HTMLElement
  /** The assembled client host context (rpc, docks, commands, …). */
  context: DevframeClientContext
}

/** A mounted renderer instance the host can tear down. */
export interface DockRendererInstance {
  /** Tear down the mounted UI and release its subscriptions. */
  dispose?: () => void
}

/**
 * A renderer for a dock `type`. The headless hub is renderer-agnostic: a
 * host registers renderers at boot (e.g. injecting `@devframes/json-render-ui`
 * for the `'json-render'` type) or serves them as prebuilt modules through the
 * hub's renderer manifest (`initHub({ renderers })`). The renderer owns its
 * framework (Vue, React, …); the hub only routes a dock type to it and
 * disposes it on deactivation.
 *
 * Integration packages narrow `Entry` to export a precisely-typed contract,
 * e.g. `@devframes/json-render/hub` exports
 * `JsonRenderDockRenderer = DockRenderer<DevframeJsonRenderDockEntry>`.
 */
export type DockRenderer<Entry extends DevframeDockEntry = DevframeDockEntry> = (
  options: DockRendererMountOptions<Entry>,
) => DockRendererInstance | Promise<DockRendererInstance>

/**
 * The outcome of {@link DockRenderersContext.mount}. A missing renderer is an
 * expected, non-exceptional state: a viewer renders its "no renderer for this
 * dock type" fallback from `missing-renderer`, and its error variant (with a
 * retry affordance) from `load-error`.
 */
export type DockRendererMountResult
  = | { status: 'mounted', dispose: () => void }
    | { status: 'missing-renderer' }
    | { status: 'load-error', error: unknown }

/**
 * The dock-renderer registry surfaced on the client host context. A viewer
 * calls {@link DockRenderersContext.mount} to render a dock whose `type` has a
 * renderer (registered locally at boot, or served as a prebuilt module by the
 * hub's renderer manifest) into a container it owns; the host tracks the
 * instance and disposes it when the entry deactivates.
 */
export interface DockRenderersContext {
  /**
   * Register a renderer for a dock `type`. Returns an unregister function.
   * Accepts a renderer narrowed to any specific entry variant (e.g. a
   * {@link DockRenderer}<DevframeJsonRenderDockEntry> from an integration
   * package); the type routes only its own entries to it.
   */
  register: (type: string, renderer: DockRenderer<any>) => () => void
  /** Look up the locally-registered renderer for a dock `type`, if any. */
  get: (type: string) => DockRenderer | undefined
  /**
   * Whether a renderer is available for a dock `type`, registered locally
   * **or** provided by the hub's renderer manifest. A viewer checks this
   * before mounting to render its missing-renderer fallback declaratively.
   */
  has: (type: string) => boolean
  /**
   * Mount the entry's renderer into `container` and resolve the
   * {@link DockRendererMountResult}. A local registration wins; otherwise the
   * manifest module for the entry's type is imported (lazily, cached) and
   * registered. The mounted instance is also disposed automatically when the
   * entry deactivates. Resolves `missing-renderer` (with a `console.warn`)
   * when neither source has the type, and `load-error` when the module import
   * or the renderer itself fails. A failed import is not cached, so a retry
   * re-imports.
   */
  mount: (entry: DevframeDockEntry, container: HTMLElement) => Promise<DockRendererMountResult>
}

/**
 * The renderer manifest published by the hub at the
 * `devframe:dock-renderers` shared-state slot: one {@link ClientScriptEntry}
 * per dock `type`, whose `importFrom` is a URL path the hub serves
 * (`<base>__renderers/<type>.mjs`). Mirrors the dock client-script
 * convention: the module's `importName` export (default `'default'`) is a
 * ready {@link DockRenderer}.
 */
export type DockRendererManifest = Record<string, ClientScriptEntry>

/** Options for {@link createDockRenderersContext}. */
export interface CreateDockRenderersContextOptions {
  /** The assembled client context handed to renderers at mount. */
  context: () => DevframeClientContext
  /** Renderers registered locally at boot; these win over manifest modules. */
  local?: Record<string, DockRenderer<any>>
  /** The current {@link DockRendererManifest} (live getter). */
  manifest?: () => DockRendererManifest
  /**
   * Called with each successful mount's disposer so the caller can tie
   * disposal to its own lifecycle (entry deactivation, host teardown). An
   * optional returned cleanup runs exactly once when the mount is disposed,
   * whichever side (caller or viewer) triggers it first.
   */
  onMounted?: (dispose: () => void, entry: DevframeDockEntry) => (() => void) | void
}

/**
 * Build the {@link DockRenderersContext} shared by every hub-aware client.
 * `createDevframeClientRuntime` and hub UI providers that assemble their own context
 * (`@devframes/hub-ui`) both delegate here so local-first resolution, lazy
 * manifest imports, and the typed mount result behave identically everywhere.
 */
export function createDockRenderersContext(
  options: CreateDockRenderersContextOptions,
): DockRenderersContext {
  const rendererMap = new Map<string, DockRenderer>()
  for (const [type, renderer] of Object.entries(options.local ?? {}))
    rendererMap.set(type, renderer)

  // In-flight/settled manifest imports, keyed by type. A rejected import is
  // evicted so the viewer's retry affordance re-imports the module.
  const manifestImports = new Map<string, Promise<DockRenderer | undefined>>()

  const manifestEntry = (type: string): ClientScriptEntry | undefined =>
    options.manifest?.()[type]

  async function importManifestRenderer(type: string, script: ClientScriptEntry): Promise<DockRenderer | undefined> {
    // Keep this a *native* dynamic import in every bundler, since the specifier is
    // a runtime URL served by the hub, not a build-time module.
    const mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ /* turbopackIgnore: true */ script.importFrom)
    const renderer = mod[script.importName ?? 'default']
    return typeof renderer === 'function' ? (renderer as DockRenderer) : undefined
  }

  async function resolveRenderer(type: string): Promise<DockRenderer | undefined> {
    const local = rendererMap.get(type)
    if (local)
      return local
    const script = manifestEntry(type)
    if (!script)
      return undefined
    let pending = manifestImports.get(type)
    if (!pending) {
      pending = importManifestRenderer(type, script)
      manifestImports.set(type, pending)
      pending.catch(() => manifestImports.delete(type))
    }
    const renderer = await pending
    // Register the loaded module so `get()` sees it and later mounts skip the
    // resolution dance, unless a local registration landed meanwhile (wins).
    if (renderer && !rendererMap.has(type))
      rendererMap.set(type, renderer)
    return renderer
  }

  return {
    register(type, renderer) {
      rendererMap.set(type, renderer)
      return () => {
        if (rendererMap.get(type) === renderer)
          rendererMap.delete(type)
      }
    },
    get: type => rendererMap.get(type),
    has: type => rendererMap.has(type) || manifestEntry(type) !== undefined,
    async mount(entry, container) {
      let renderer: DockRenderer | undefined
      try {
        renderer = await resolveRenderer(entry.type)
      }
      catch (error) {
        console.error(`[@devframes/hub] failed to load the renderer module for dock type "${entry.type}"`, error)
        return { status: 'load-error', error }
      }
      if (!renderer) {
        console.warn(`[@devframes/hub] no renderer registered for dock type "${entry.type}" (entry "${entry.id}")`)
        return { status: 'missing-renderer' }
      }
      let instance: DockRendererInstance
      try {
        instance = await renderer({ entry, container, context: options.context() })
      }
      catch (error) {
        console.error(`[@devframes/hub] renderer for dock type "${entry.type}" failed to mount (entry "${entry.id}")`, error)
        return { status: 'load-error', error }
      }
      let disposed = false
      let cleanup: (() => void) | void
      const dispose = (): void => {
        if (disposed)
          return
        disposed = true
        cleanup?.()
        instance.dispose?.()
      }
      cleanup = options.onMounted?.(dispose, entry)
      return { status: 'mounted', dispose }
    },
  }
}
