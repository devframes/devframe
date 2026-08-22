import type { DevframeCommandEntry } from '@devframes/hub'
import { walkCommands } from './keybindings'

/**
 * One level of the palette's drill-down stack: the command the user stepped
 * into, and the rows that level shows.
 */
export interface PaletteCrumb {
  title: string
  items: DevframeCommandEntry[]
}

/** A palette row, flattened out of the command tree for root search. */
export interface PaletteFlatItem {
  entry: DevframeCommandEntry
  parentTitle?: string
  searchTitle: string
}

/**
 * Every command at every depth, so root search finds a nested entry — a dock
 * group's members, and anything a devframe nests below them — without drilling.
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
 * The drill-down stack that lands on `scopeId`'s children — one crumb per
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
        .map(c => ({ title: c.title, items: c.children as DevframeCommandEntry[] }))
    }
    return 'stop'
  })
  return crumbs
}
