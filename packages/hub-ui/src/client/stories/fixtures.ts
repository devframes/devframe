import type { DevframeDockEntry, DevframeMessageEntry, DevframeViewGroup } from '@devframes/hub'

type Extra = Partial<DevframeDockEntry>

/** An iframe dock entry (the common case). */
export function iframe(id: string, title: string, icon: string, extra: Extra = {}): DevframeDockEntry {
  return { id, type: 'iframe', url: '/', title, icon, ...extra } as DevframeDockEntry
}

/** An action dock entry - a one-shot command with no panel of its own. */
function action(id: string, title: string, icon: string, extra: Extra = {}): DevframeDockEntry {
  return { id, type: 'action', title, icon, ...extra } as DevframeDockEntry
}

/** A group entry - a collapse button whose members declare `groupId: id`. */
export function group(id: string, title: string, icon: string, extra: Partial<DevframeViewGroup> = {}): DevframeDockEntry {
  return { id, type: 'group', title, icon, ...extra } as DevframeDockEntry
}

/**
 * A small, single-category bar: a few top-level tools, no groups.
 */
export const basicEntries: DevframeDockEntry[] = [
  iframe('overview', 'Overview', 'ph:gauge-duotone'),
  iframe('inspect', 'Inspect', 'ph:stethoscope-duotone'),
  iframe('assets', 'Assets', 'ph:images-duotone'),
]

/**
 * A bar spanning several categories, so separators and category ordering show.
 */
export const categorizedEntries: DevframeDockEntry[] = [
  iframe('overview', 'Overview', 'ph:gauge-duotone', { category: 'app' }),
  iframe('routes', 'Routes', 'ph:signpost-duotone', { category: 'app' }),
  iframe('components', 'Components', 'ph:puzzle-piece-duotone', { category: 'framework' }),
  iframe('modules', 'Modules', 'ph:plugs-connected-duotone', { category: 'framework' }),
  iframe('network', 'Network', 'ph:wifi-high-duotone', { category: 'web' }),
  iframe('graph', 'Graph', 'ph:graph-duotone', { category: 'advanced' }),
]

/**
 * Groups: a Nuxt umbrella (with a `defaultChildId`) and a Playground umbrella
 * (popover-only), alongside a couple of top-level tools and an action.
 */
export const groupedEntries: DevframeDockEntry[] = [
  iframe('overview', 'Overview', 'ph:gauge-duotone'),
  action('reload', 'Reload', 'ph:arrow-clockwise-duotone'),

  group('nuxt', 'Nuxt', 'logos:nuxt-icon', { category: 'framework', defaultChildId: 'nuxt:overview' }),
  iframe('nuxt:overview', 'Overview', 'ph:gauge-duotone', { groupId: 'nuxt', defaultOrder: 0 }),
  iframe('nuxt:pages', 'Pages', 'ph:files-duotone', { groupId: 'nuxt', defaultOrder: 1 }),
  iframe('nuxt:components', 'Components', 'ph:puzzle-piece-duotone', { groupId: 'nuxt', defaultOrder: 2, badge: '3' }),
  iframe('nuxt:modules', 'Modules', 'ph:plugs-connected-duotone', { groupId: 'nuxt', defaultOrder: 3 }),

  group('playground', 'Playground', 'ph:flask-duotone', { category: 'framework' }),
  iframe('playground:one', 'One', 'ph:number-circle-one-duotone', { groupId: 'playground' }),
  iframe('playground:two', 'Two', 'ph:number-circle-two-duotone', { groupId: 'playground' }),
]

/**
 * A single group whose members carry in-group sub-categories, so the popover /
 * sidebar / settings show sub-category dividers and headers. The group's own
 * `category` (`framework`) is the outer bucket; members split by their own
 * `category` inside the group.
 */
export const subcategorizedGroupEntries: DevframeDockEntry[] = [
  group('tools', 'Tools', 'ph:wrench-duotone', { category: 'framework' }),
  iframe('tools:overview', 'Overview', 'ph:gauge-duotone', { groupId: 'tools', category: 'app', defaultOrder: 0 }),
  iframe('tools:routes', 'Routes', 'ph:signpost-duotone', { groupId: 'tools', category: 'app', defaultOrder: 1 }),
  iframe('tools:components', 'Components', 'ph:puzzle-piece-duotone', { groupId: 'tools', category: 'framework', defaultOrder: 2 }),
  iframe('tools:graph', 'Graph', 'ph:graph-duotone', { groupId: 'tools', category: 'advanced', defaultOrder: 3 }),
]

/** The Tools group entry on its own (for sub-category group stories). */
export const toolsGroup = subcategorizedGroupEntries.find(e => e.id === 'tools') as DevframeViewGroup

/**
 * Enough top-level entries to exceed the dock's 5-slot capacity, so the overflow
 * button appears.
 */
export const overflowEntries: DevframeDockEntry[] = [
  iframe('overview', 'Overview', 'ph:gauge-duotone'),
  iframe('routes', 'Routes', 'ph:signpost-duotone'),
  iframe('components', 'Components', 'ph:puzzle-piece-duotone'),
  iframe('modules', 'Modules', 'ph:plugs-connected-duotone'),
  iframe('assets', 'Assets', 'ph:images-duotone'),
  iframe('network', 'Network', 'ph:wifi-high-duotone'),
  iframe('timeline', 'Timeline', 'ph:chart-line-duotone'),
  iframe('graph', 'Graph', 'ph:graph-duotone'),
  iframe('terminal', 'Terminal', 'ph:terminal-window-duotone'),
]

/** A message/log entry for the messages panel and toasts. */
export function message(extra: Partial<DevframeMessageEntry> = {}): DevframeMessageEntry {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    message: 'Something happened',
    level: 'info',
    from: 'server',
    timestamp: Date.now(),
    ...extra,
  } as DevframeMessageEntry
}

/** One message per level, covering the common shapes. */
export const sampleMessages: DevframeMessageEntry[] = [
  message({ level: 'error', message: 'Failed to resolve import "./missing"', description: 'in src/main.ts', category: 'runtime', labels: ['vite'] }),
  message({ level: 'warn', message: 'Large chunk detected (612 kB)', category: 'build' }),
  message({ level: 'success', message: 'HMR update applied', category: 'hmr' }),
  message({ level: 'info', message: 'Server restarted', description: 'config change detected', category: 'server' }),
  message({ level: 'warn', message: 'Checking accessibility…', status: 'loading', category: 'a11y' }),
]
