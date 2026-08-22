import type { DevframeCommandEntry, DevframeCommandKeybinding } from '@devframes/hub'
import type { WhenContext } from 'devframe/utils/when'
import { evaluateWhen } from 'devframe/utils/when'

export type { WhenContext } from 'devframe/utils/when'

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '')

export function formatKeybinding(key: string): string[] {
  return key.split('+').map((part) => {
    if (part === 'Mod')
      return isMac ? '\u2318' : 'Ctrl'
    if (part === 'Shift')
      return isMac ? '\u21E7' : 'Shift'
    if (part === 'Alt')
      return isMac ? '\u2325' : 'Alt'
    return part
  })
}

export function normalizeKeyEvent(e: KeyboardEvent): string {
  const parts: string[] = []
  if (isMac ? e.metaKey : e.ctrlKey)
    parts.push('Mod')
  if (isMac ? e.ctrlKey : e.metaKey)
    parts.push(isMac ? 'Ctrl' : 'Meta')
  if (e.altKey)
    parts.push('Alt')
  if (e.shiftKey)
    parts.push('Shift')

  // Normalize key name
  let key = e.key
  if (key.length === 1)
    key = key.toUpperCase()

  // Don't add modifier keys as the main key
  if (!['Control', 'Meta', 'Alt', 'Shift'].includes(key))
    parts.push(key)

  return parts.join('+')
}

function areKeybindingsEqual(
  left: DevframeCommandKeybinding[] | undefined,
  right: DevframeCommandKeybinding[] | undefined,
): boolean {
  const leftBindings = left ?? []
  const rightBindings = right ?? []
  return leftBindings.length === rightBindings.length
    && leftBindings.every((binding, index) => binding.key === rightBindings[index]?.key)
}

export function isKeybindingOverrideDifferentFromDefault(
  override: DevframeCommandKeybinding[] | undefined,
  defaults: DevframeCommandKeybinding[] | undefined,
): boolean {
  return override !== undefined && !areKeybindingsEqual(override, defaults)
}

/**
 * What a `walkCommands` visitor can ask the walk to do next: `'skip'` leaves the
 * current command's subtree unvisited, `'stop'` ends the whole walk.
 */
export type WalkCommandsSignal = 'skip' | 'stop'

/**
 * Walk the command tree depth-first, parents before their children, and hand
 * each command its chain of ancestors (outermost first, empty at the top level).
 *
 * Commands nest arbitrarily deep — dock-navigation commands reach `Docks` ›
 * group › member, and a host's own `children` go deeper still — so read-only
 * consumers share this walk rather than recursing themselves. Transforms that
 * rebuild the tree (see {@link filterCommandsByWhen}) still recurse on their
 * own, since they need to return a new node per level.
 */
export function walkCommands(
  commands: DevframeCommandEntry[],
  visit: (cmd: DevframeCommandEntry, ancestors: DevframeCommandEntry[]) => WalkCommandsSignal | void,
  ancestors: DevframeCommandEntry[] = [],
): WalkCommandsSignal | void {
  for (const cmd of commands) {
    const signal = visit(cmd, ancestors)
    if (signal === 'stop')
      return 'stop'
    if (signal === 'skip' || !cmd.children?.length)
      continue
    // `children` is typed `Server[] | Client[]` rather than `(Server | Client)[]`,
    // so walking it widens the element type — same cast the other child-walking
    // call sites use.
    if (walkCommands(cmd.children as DevframeCommandEntry[], visit, [...ancestors, cmd]) === 'stop')
      return 'stop'
  }
}

/**
 * Find a command by id at any depth. Returns the first match in depth-first
 * order — ids are expected to be unique across the tree.
 */
export function findCommandDeep(
  commands: DevframeCommandEntry[],
  id: string,
): DevframeCommandEntry | undefined {
  let found: DevframeCommandEntry | undefined
  walkCommands(commands, (cmd) => {
    if (cmd.id !== id)
      return
    found = cmd
    return 'stop'
  })
  return found
}

/**
 * Drop the commands whose `when` clause does not hold in the current context,
 * descendants included at every depth — `when` controls palette visibility at
 * any nesting level.
 *
 * A parent that survives is shallow-cloned so its `children` can be narrowed
 * without mutating the registry. Callers therefore get fresh parent objects on
 * every call: match entries by `id`, never by reference.
 */
export function filterCommandsByWhen(
  commands: DevframeCommandEntry[],
  ctx: WhenContext,
): DevframeCommandEntry[] {
  const isAvailable = (cmd: { when?: string }) => !cmd.when || evaluateWhen(cmd.when, ctx)

  const filter = (list: DevframeCommandEntry[]): DevframeCommandEntry[] => {
    const result: DevframeCommandEntry[] = []
    for (const cmd of list) {
      if (!isAvailable(cmd))
        continue
      if (!cmd.children) {
        result.push(cmd)
        continue
      }
      const children = filter(cmd.children as DevframeCommandEntry[])
      result.push({ ...cmd, children } as DevframeCommandEntry)
    }
    return result
  }

  return filter(commands)
}

export function collectAllKeybindings(
  commands: { value: DevframeCommandEntry[] },
  getKeybindings: (id: string) => DevframeCommandKeybinding[],
): Array<{ id: string, keybinding: DevframeCommandKeybinding }> {
  const result: Array<{ id: string, keybinding: DevframeCommandKeybinding }> = []

  walkCommands(commands.value, (cmd) => {
    for (const kb of getKeybindings(cmd.id)) {
      result.push({ id: cmd.id, keybinding: kb })
    }
  })

  return result
}

export const KNOWN_BROWSER_SHORTCUTS: Record<string, string> = {
  'Mod+T': 'Open new tab',
  'Mod+W': 'Close tab',
  'Mod+N': 'Open new window',
  'Mod+L': 'Focus address bar',
  'Mod+D': 'Bookmark page',
  'Mod+Q': 'Quit browser',
  'Mod+Shift+T': 'Reopen closed tab',
  'Mod+Shift+N': 'Open incognito window',
  'Mod+Shift+W': 'Close window',
  'Mod+Shift+Q': 'Quit browser (Chrome)',
  'Alt+F4': 'Close window (Windows)',
  'Mod+R': 'Reload page',
  'Mod+Shift+R': 'Hard reload page',
  'Mod+F': 'Find in page',
}
