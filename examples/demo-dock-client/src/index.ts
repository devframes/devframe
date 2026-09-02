import type { DockClientScriptContext } from '@devframes/hub/client'
import type { Emitter } from 'nanoevents'
import { createNanoEvents } from 'nanoevents'

interface DemoEvents {
  activated: (count: number) => void
}

interface DemoStore {
  /** How many times the demo dock has been activated on this page. */
  activations: number
  /** Shared emitter - every module instance converges on this one. */
  events: Emitter<DemoEvents>
}

const KEY_GLOBAL = '__devframes_demo_dock_client__'

/**
 * Shared state anchored on `globalThis`, the pattern
 * `vite-plugin-vue-tracer`'s `__vue_tracer__` store establishes: the same
 * script may load as a Vite-graph module on one host and as a self-contained
 * bundle on another, so two module instances must converge on one store
 * rather than rely on module identity. Realm identity (the inspected page's
 * `window`) is the contract; module identity is best-effort.
 */
function getStore(): DemoStore {
  const holder = globalThis as Record<string, unknown> & { [KEY_GLOBAL]?: DemoStore }
  if (!holder[KEY_GLOBAL]) {
    const store: DemoStore = { activations: 0, events: createNanoEvents<DemoEvents>() }
    Object.defineProperty(holder, KEY_GLOBAL, { value: store, configurable: true, enumerable: false })
  }
  return holder[KEY_GLOBAL]!
}

/**
 * The dock `action` client script: counts activations in the shared store and
 * mirrors each one into the hub's messages feed, so both consumption modes
 * (bare specifier through the host's module graph, self-contained bundle by
 * URL) demonstrably run the same code against the same state.
 */
export default function setup(ctx: DockClientScriptContext): void {
  const store = getStore()
  ctx.current.events.on('entry:activated', () => {
    store.activations += 1
    store.events.emit('activated', store.activations)
    void ctx.messages.info(`Demo client script activated (#${store.activations} this page)`, {
      description: `Loaded from ${new URL(import.meta.url).pathname}`,
    })
  })
}
