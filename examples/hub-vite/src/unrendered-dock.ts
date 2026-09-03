import type { DevframeDockEntryBase } from '@devframes/hub/types'

/**
 * A dock variant registered through the hub's **open** dock union, exactly
 * how an opt-in integration contributes its own type, that no renderer
 * covers on purpose. It witnesses the missing-renderer path: the hub UI provider
 * resolves the type against its renderer registry (local registrations, then
 * the hub's renderer manifest), finds nothing, and renders its fallback view
 * (`No renderer for "demo-unrendered" in the current environment`) instead
 * of a dead panel.
 */
export interface DemoUnrenderedDockEntry extends DevframeDockEntryBase {
  type: 'demo-unrendered'
}

declare module '@devframes/hub/types' {
  interface DevframeDockEntryRegistry {
    'demo-unrendered': DemoUnrenderedDockEntry
  }
}

export const unrenderedDockEntry: DemoUnrenderedDockEntry = {
  type: 'demo-unrendered',
  id: 'example:unrendered',
  title: 'No Renderer',
  icon: 'ph:puzzle-piece-duotone',
  category: 'app',
}
