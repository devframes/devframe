import type { DevframeDockEntry } from '../types/docks'
import type { DevframeClientContext } from './docks'

/**
 * Options handed to a dock renderer when the client host mounts a dock entry.
 */
export interface DockRendererMountOptions {
  /** The dock entry being rendered (carries the entry's serializable payload). */
  entry: DevframeDockEntry
  /** The DOM element the renderer should mount into. */
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
 * A renderer for a dock `type`. The headless hub is renderer-agnostic — a
 * host application registers renderers at boot (e.g. injecting
 * `@devframes/json-render-ui` for the `'json-render'` type). The renderer
 * owns its framework (Vue, React, …); the hub only routes a dock type to it
 * and disposes it on deactivation.
 */
export type DockRenderer = (
  options: DockRendererMountOptions,
) => DockRendererInstance | Promise<DockRendererInstance>

/**
 * The dock-renderer registry surfaced on the client host context. A viewer
 * calls {@link DockRenderersContext.mount} to render a dock whose `type` has a
 * registered renderer into a container it owns; the host tracks the instance
 * and disposes it when the entry deactivates.
 */
export interface DockRenderersContext {
  /** Register a renderer for a dock `type`. Returns an unregister function. */
  register: (type: string, renderer: DockRenderer) => () => void
  /** Look up the renderer registered for a dock `type`, if any. */
  get: (type: string) => DockRenderer | undefined
  /** Whether a renderer is registered for a dock `type`. */
  has: (type: string) => boolean
  /**
   * Mount the entry's registered renderer into `container`. Resolves to a
   * disposer; the same instance is also disposed automatically when the entry
   * deactivates. Warns and resolves to a no-op disposer when no renderer is
   * registered for the entry's type.
   */
  mount: (entry: DevframeDockEntry, container: HTMLElement) => Promise<() => void>
}
