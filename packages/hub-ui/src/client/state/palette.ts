import type { DevframeCommandEntry, DevframeDockEntry } from '@devframes/hub'
import { walkCommands } from './keybindings'

const DOCKS_COMMAND_ID = 'devframes:docks'

/** Build the command id used for one dock entry. */
export function dockCommandId(dockId: string): string {
  return `${DOCKS_COMMAND_ID}:${dockId}`
}

/**
 * One level of the palette's drill-down stack: the command the user stepped
 * into, and the rows that level shows.
 */
export interface PaletteCrumb {
  id: string
  title: string
  items: DevframeCommandEntry[]
}

/** The command whose children the current breadcrumb level displays. */
export function paletteTrailScopeId(trail: PaletteCrumb[]): string | null {
  return trail.at(-1)?.id ?? null
}

/** A palette row, flattened out of the command tree for root search. */
export interface PaletteFlatItem {
  entry: DevframeCommandEntry
  parentTitle?: string
  searchTitle: string
}

export type PaletteSelection = 'drill' | 'execute'

/** Dock groups are the actionable parents directly below the Docks command. */
function isDockGroupCommand(
  entry: DevframeCommandEntry,
  docks: readonly DevframeDockEntry[],
): boolean {
  return entry.source === 'client'
    && !!entry.action
    && !!entry.children?.length
    && docks.some(dock => dock.type === 'group' && dockCommandId(dock.id) === entry.id)
}

/** Decide whether selecting a row navigates into it or executes it. */
export function resolvePaletteSelection(
  entry: DevframeCommandEntry,
  docks: readonly DevframeDockEntry[],
): PaletteSelection {
  if (isDockGroupCommand(entry, docks))
    return 'execute'
  return entry.children?.length ? 'drill' : 'execute'
}

/** An ambiguous dock group keeps the palette open by scoping it to itself. */
export function paletteActionKeepsOpen(
  entry: DevframeCommandEntry,
  docks: readonly DevframeDockEntry[],
  paletteOpen: boolean,
  paletteScopeId: string | null,
): boolean {
  return isDockGroupCommand(entry, docks)
    && paletteOpen
    && paletteScopeId === entry.id
}

/**
 * Every command at every depth, so root search finds a nested entry: a dock
 * group's members, and anything a devframe nests below them, without drilling.
 *
 * `searchTitle` carries the full path, so typing "docks ping" and typing "ping"
 * both match, while the row itself shows only the immediate parent: a deep entry
 * rendered as a full breadcrumb truncates away the part the user was looking
 * for.
 *
 * `showInPalette: 'without-children'` prunes the command's whole subtree, not
 * just its direct children: the flag means "reach my descendants by drilling
 * down", and leaking grandchildren into root search would invert that.
 * `showInPalette: false` prunes the command itself along with its subtree.
 */
export function flattenPaletteCommands(commands: DevframeCommandEntry[]): PaletteFlatItem[] {
  const result: PaletteFlatItem[] = []

  walkCommands(commands, (cmd, ancestors) => {
    if (cmd.showInPalette === false)
      return 'skip'
    const parentTitle = ancestors.at(-1)?.title
    result.push({
      entry: cmd,
      ...(parentTitle ? { parentTitle } : {}),
      searchTitle: [...ancestors.map(a => a.title), cmd.title].join(' > '),
    })
    if (cmd.showInPalette === 'without-children')
      return 'skip'
  })

  return result
}

/**
 * The drill-down stack that lands on `scopeId`'s children: one crumb per
 * ancestor that has children, plus the command itself, so `openPalette(id)`
 * looks exactly like the user clicked their way down to that command.
 *
 * Returns `[]` when the id is unknown or leads nowhere, which opens the root
 * list: a scope pointing at a command that has since been unregistered should
 * degrade to a normal palette, not an empty one.
 */
export function paletteScopeTrail(
  commands: DevframeCommandEntry[],
  scopeId: string | null,
): PaletteCrumb[] {
  if (!scopeId)
    return []

  let crumbs: PaletteCrumb[] = []
  walkCommands(commands, (cmd, ancestors) => {
    if (cmd.id !== scopeId)
      return
    if (cmd.children?.length) {
      crumbs = [...ancestors, cmd]
        .filter(c => c.children?.length)
        .map(c => ({ id: c.id, title: c.title, items: c.children as DevframeCommandEntry[] }))
    }
    return 'stop'
  })
  return crumbs
}

/**
 * Rebuild an open drill-down trail from the live command tree. Command ids keep
 * the user's current level stable while every row is replaced with its latest
 * entry object, so an unregistered or updated action cannot linger in a crumb.
 */
export function reconcilePaletteTrail(
  commands: DevframeCommandEntry[],
  current: PaletteCrumb[],
  scopeId: string | null,
): PaletteCrumb[] {
  const scopeWasActive = scopeId != null && current.some(crumb => crumb.id === scopeId)
  const result: PaletteCrumb[] = []
  let level = commands

  for (const crumb of current) {
    const entry = level.find(command => command.id === crumb.id)
    if (!entry?.children?.length)
      break
    const items = entry.children as DevframeCommandEntry[]
    result.push({ id: entry.id, title: entry.title, items })
    level = items
  }

  if (scopeWasActive && !result.some(crumb => crumb.id === scopeId))
    return paletteScopeTrail(commands, scopeId)

  return result
}
