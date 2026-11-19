import type { DevframeCommandEntry, DevframeDockContextMenuArg, DevframeDockContextMenuCommand, DevframeDockContextMenuItem, DevframeDockEntryIcon } from '@devframes/hub'
import type { WhenContext } from 'devframe/utils/when'
import { resolveTitle } from '@devframes/hub/client'
import { evaluateWhen } from 'devframe/utils/when'
import { filterCommandsByWhen, findCommandDeep } from './keybindings'

export type ResolvedDockMenuItem
  = | {
    type: 'command'
    command: string
    args: readonly DevframeDockContextMenuArg[]
    title: string
    icon?: DevframeDockEntryIcon
    checked?: boolean
  }
  | { type: 'separator' }

function resolveCommandItem(
  item: DevframeDockContextMenuCommand,
  available: DevframeCommandEntry[],
  ctx: WhenContext,
  locale: string | undefined,
): ResolvedDockMenuItem | undefined {
  if (item.when && !evaluateWhen(item.when, ctx))
    return
  const command = findCommandDeep(available, item.command)
  if (!command || (command.source === 'client' && !command.action))
    return
  return {
    type: 'command',
    command: command.id,
    args: item.args ?? [],
    title: item.title
      ? resolveTitle({ title: item.title, titleLocales: item.titleLocales }, locale)
      : command.title,
    icon: item.icon ?? command.icon,
    checked: item.checked,
  }
}

/** Drop separators at the start and the end, and merge runs of them into one. */
function collapseSeparators(items: ResolvedDockMenuItem[]): ResolvedDockMenuItem[] {
  const result: ResolvedDockMenuItem[] = []
  for (const item of items) {
    if (item.type === 'separator' && (!result.length || result.at(-1)!.type === 'separator'))
      continue
    result.push(item)
  }
  if (result.at(-1)?.type === 'separator')
    result.pop()
  return result
}

/**
 * Turn the `contextMenu` of a dock entry into the items to show.
 *
 * An item is dropped when its own `when` is false, when no available command
 * has its id, or when it points to a client command with no action. Title and
 * icon fall back to the values of the command.
 */
export function resolveDockContextMenu(
  items: readonly DevframeDockContextMenuItem[] | undefined,
  commands: DevframeCommandEntry[],
  ctx: WhenContext,
  locale: string | undefined,
): ResolvedDockMenuItem[] {
  if (!items?.length)
    return []
  const available = filterCommandsByWhen(commands, ctx)
  const resolved = items.flatMap(item => item.type === 'separator'
    ? [
        { type: 'separator' } as const,
      ]
    : resolveCommandItem(item, available, ctx, locale) ?? [])
  return collapseSeparators(resolved)
}
