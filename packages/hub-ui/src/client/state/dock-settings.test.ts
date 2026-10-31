import type { DevframeDockEntriesGrouped, DevframeDockEntry, DevframeViewGroup } from '@devframes/hub'
import type { WhenContext } from 'devframe/utils/when'
import { DEFAULT_STATE_USER_SETTINGS } from '@devframes/hub/constants'
import { describe, expect, it } from 'vitest'
import { docksGroupByCategories, docksSplitGroupsBySize, docksSplitGroupsWithCapacity, getGroupMembersGrouped, resolveGroupPreferredChild, resolveNextRecentDockIds, resolveRecentDockEntries } from './dock-settings'

function iframe(id: string, extra: Partial<DevframeDockEntry> = {}): DevframeDockEntry {
  return { id, type: 'iframe', url: '/', title: id.toUpperCase(), icon: 'ph:cube-duotone', ...extra } as DevframeDockEntry
}

function group(id: string, extra: Partial<DevframeViewGroup> = {}): DevframeDockEntry {
  return { id, type: 'group', title: id.toUpperCase(), icon: 'ph:folder-duotone', ...extra } as DevframeDockEntry
}

function action(id: string, extra: Partial<DevframeDockEntry> = {}): DevframeDockEntry {
  return { id, type: 'action', action: { importFrom: '/action.js' }, title: id.toUpperCase(), icon: 'ph:play-duotone', ...extra } as DevframeDockEntry
}

function ids(groups: DevframeDockEntriesGrouped): string[] {
  return groups.flatMap(([, items]) => items.map(item => item.id))
}

// Five top-level docks on a 3-slot bar: [a] [b] [c] | [overflow: d, e]
const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map(id => iframe(id))
const rail: DevframeDockEntriesGrouped = [['default', [a, b, c, d, e]]]

describe('docksSplitGroupsBySize', () => {
  const splitAt = (groups: DevframeDockEntriesGrouped, size: number) => docksSplitGroupsBySize(groups, size, 32, 2, 9.5)

  it('restores every entry when the toolbar fits exactly, without reserving overflow', () => {
    expect(ids(splitAt(rail, 168).visible)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(splitAt(rail, 168).overflow).toEqual([])
    expect(ids(splitAt(rail, 167).overflow)).toEqual(['d', 'e'])
  })

  it('reserves the more button and preserves category order in a small toolbar', () => {
    const groups: DevframeDockEntriesGrouped = [['first', [a, b]], ['second', [c, d, e]]]
    const split = splitAt(groups, 145.5)
    expect(split.visible).toEqual([['first', [a, b]], ['second', [c]]])
    expect(split.overflow).toEqual([['second', [d, e]]])
    expect(ids(splitAt(groups, 145).visible)).toEqual(['a', 'b'])
  })

  it('keeps a lone category overflow from folding back with an extra divider', () => {
    const groups: DevframeDockEntriesGrouped = [['first', [a, b]], ['second', [c]]]
    // Three icons fit (100px), but their category divider does not (111.5px).
    const split = splitAt(groups, 100)
    expect(ids(split.visible)).toEqual(['a', 'b'])
    expect(ids(split.overflow)).toEqual(['c'])
    expect(ids(splitAt(groups, 99.5).visible)).toEqual(['a'])
    expect(ids(splitAt(groups, 111.5).visible)).toEqual(['a', 'b', 'c'])
    expect(splitAt(groups, 111.5).overflow).toEqual([])
  })

  it('can put all entries in the menu when only the more button fits', () => {
    const split = splitAt(rail, 32)
    expect(split.visible).toEqual([])
    expect(ids(split.overflow)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('fits the rendered entries, dividers and menu across resize boundaries without losing entries', () => {
    const groups: DevframeDockEntriesGrouped = [['first', [a, b]], ['second', [c]], ['third', [d, e]]]
    for (let available = 32; available <= 200; available += 0.5) {
      const split = splitAt(groups, available)
      const buttons = ids(split.visible).length + Number(split.overflow.length > 0)
      const dividers = Math.max(0, split.visible.length - 1)
      const renderedSize = buttons * 32 + dividers * 9.5 + Math.max(0, buttons + dividers - 1) * 2
      expect(renderedSize).toBeLessThanOrEqual(available)
      expect([...ids(split.visible), ...ids(split.overflow)]).toEqual(['a', 'b', 'c', 'd', 'e'])
    }
  })
})

describe('docksSplitGroupsWithCapacity', () => {
  it('splits naturally without recent entries', () => {
    const split = docksSplitGroupsWithCapacity(rail, 3)
    expect(ids(split.visible)).toEqual(['a', 'b', 'c'])
    expect(ids(split.overflow)).toEqual(['d', 'e'])
    expect(split.recent).toEqual([])
  })

  it('raises a recent entry out of the overflow without displacing bar items', () => {
    const split = docksSplitGroupsWithCapacity(rail, 3, [d])
    // Only `e` is left beyond the bar, so it folds in instead of overflowing.
    expect(ids(split.visible)).toEqual(['a', 'b', 'c', 'e'])
    expect(ids(split.overflow)).toEqual([])
    expect(split.recent).toEqual([d])
  })

  it('keeps several recent entries newest first', () => {
    const f = iframe('f')
    const longRail: DevframeDockEntriesGrouped = [['default', [a, b, c, d, e, f]]]
    const split = docksSplitGroupsWithCapacity(longRail, 3, [e, d])
    expect(ids(split.visible)).toEqual(['a', 'b', 'c', 'f'])
    expect(split.recent).toEqual([e, d])
  })

  it('renders a recent entry inside the visible slice in place', () => {
    const split = docksSplitGroupsWithCapacity(rail, 3, [c])
    expect(ids(split.visible)).toEqual(['a', 'b', 'c'])
    expect(ids(split.overflow)).toEqual(['d', 'e'])
    expect(split.recent).toEqual([])
  })

  it('raises a grouped member without touching the overflow', () => {
    const g = group('g')
    const member = iframe('g:member', { groupId: 'g' })
    const groupedRail: DevframeDockEntriesGrouped = [['default', [a, b, g, c, d]]]
    const split = docksSplitGroupsWithCapacity(groupedRail, 3, [member])
    expect(ids(split.visible)).toEqual(['a', 'b', 'g'])
    expect(ids(split.overflow)).toEqual(['c', 'd'])
    expect(split.recent).toEqual([member])
  })

  it('raises a grouped member when the bar does not overflow', () => {
    const member = iframe('g:member', { groupId: 'g' })
    const smallRail: DevframeDockEntriesGrouped = [['default', [a, b, c]]]
    const split = docksSplitGroupsWithCapacity(smallRail, 3, [member])
    expect(ids(split.visible)).toEqual(['a', 'b', 'c'])
    expect(split.overflow).toEqual([])
    expect(split.recent).toEqual([member])
  })

  it('folds a lone overflowing entry, which then renders in place', () => {
    const foldRail: DevframeDockEntriesGrouped = [['default', [a, b, c, d]]]
    const split = docksSplitGroupsWithCapacity(foldRail, 3, [d])
    expect(ids(split.visible)).toEqual(['a', 'b', 'c', 'd'])
    expect(split.overflow).toEqual([])
    expect(split.recent).toEqual([])
  })
})

describe('resolveNextRecentDockIds', () => {
  function next(recentEntries: DevframeDockEntry[], selected: DevframeDockEntry, selectedIsGroupMember = false, limit = 3) {
    return resolveNextRecentDockIds({ groups: rail, capacity: 3, recentEntries, selected, selectedIsGroupMember, limit })
  }

  it('follows the a-e walkthrough on a 3-slot bar', () => {
    // [a] [b] [c] | [O: d, e]: selecting d from the overflow raises it
    expect(next([], d)).toEqual(['d'])
    // [a] [b] [c] [e] | [d]: selecting a bar item or d itself keeps the list
    expect(next([d], a)).toEqual(['d'])
    expect(next([d], e)).toEqual(['d'])
    expect(next([d], d)).toEqual(['d'])
  })

  it('puts a new grouped member first and drops the oldest past the limit', () => {
    const [m1, m2, m3] = ['g:1', 'g:2', 'g:3'].map(id => iframe(id, { groupId: 'g' }))
    expect(next([], m1, true)).toEqual(['g:1'])
    expect(next([m1], m2, true)).toEqual(['g:2', 'g:1'])
    expect(next([m2, m1], m3, true, 2)).toEqual(['g:3', 'g:2'])
  })

  it('keeps the slots in place when a recent member is opened again', () => {
    const [m1, m2] = ['g:1', 'g:2'].map(id => iframe(id, { groupId: 'g' }))
    expect(next([m2, m1], m1, true)).toEqual(['g:2', 'g:1'])
  })

  it('remembers nothing when the limit is 0', () => {
    expect(next([d], e, false, 0)).toEqual([])
    expect(next([], iframe('g:1', { groupId: 'g' }), true, 0)).toEqual([])
  })

  it('keeps the list when the selection is off the rail entirely', () => {
    expect(next([d], iframe('~notice'))).toEqual(['d'])
    expect(next([], iframe('~notice'))).toEqual([])
  })

  it('keeps a visible selection from claiming a slot', () => {
    expect(next([], a)).toEqual([])
  })
})

describe('pinned group members', () => {
  const g = group('g', { category: 'framework' })
  const m1 = iframe('g:1', { groupId: 'g' })
  const m2 = iframe('g:2', { groupId: 'g' })
  const entries = [a, g, m1, m2]
  const settings = { ...DEFAULT_STATE_USER_SETTINGS(), docksPinned: ['g:2'] }

  it('lifts a pinned member onto the bar when asked', () => {
    const groups = docksGroupByCategories(entries, settings, { collapseGroups: true, liftPinnedMembers: true })
    expect(groups.map(([category, items]) => [category, items.map(item => item.id)])).toEqual([
      ['~pinned', ['g:2']],
      ['framework', ['g']],
      ['default', ['a']],
    ])
  })

  it('keeps a pinned member collapsed without liftPinnedMembers', () => {
    const groups = docksGroupByCategories(entries, settings, { collapseGroups: true })
    expect(ids(groups)).toEqual(['g', 'a'])
  })

  it('still leads the pinned member inside its group', () => {
    const members = getGroupMembersGrouped(entries, 'g', settings)
    expect(members.map(([category, items]) => [category, items.map(item => item.id)])).toEqual([
      ['~pinned', ['g:2']],
      ['default', ['g:1']],
    ])
  })

  it('renders a pinned recent member in place instead of in a recent slot', () => {
    const groups = docksGroupByCategories(entries, settings, { collapseGroups: true, liftPinnedMembers: true })
    expect(docksSplitGroupsWithCapacity(groups, 5, [m2, m1]).recent).toEqual([m1])
  })
})

describe('resolveGroupPreferredChild', () => {
  const g = group('g', { defaultChildId: 'g:default' }) as DevframeViewGroup
  const defaultMember = iframe('g:default', { groupId: 'g' })
  const otherMember = iframe('g:other', { groupId: 'g' })
  const entries = [a, g, defaultMember, otherMember]

  it('prefers the last-opened member over defaultChildId', () => {
    expect(resolveGroupPreferredChild(entries, g, 'g:other')).toBe(otherMember)
  })

  it('falls back to defaultChildId before any member has been opened', () => {
    expect(resolveGroupPreferredChild(entries, g, undefined)).toBe(defaultMember)
  })

  it('falls back to defaultChildId when the remembered member is gone', () => {
    expect(resolveGroupPreferredChild([a, g, defaultMember], g, 'g:other')).toBe(defaultMember)
  })

  it('falls back to defaultChildId when the remembered member fails its when clause', () => {
    const whenContext: WhenContext = { clientType: 'standalone', dockOpen: false, paletteOpen: false, dockSelectedId: '' }
    const gated = iframe('g:gated', { groupId: 'g', when: 'clientType == embedded' })
    expect(resolveGroupPreferredChild([g, defaultMember, gated], g, 'g:gated', whenContext)).toBe(defaultMember)
  })

  it('falls back to defaultChildId when the remembered member is an action', () => {
    const rememberedAction = action('g:run', { groupId: 'g' })
    expect(resolveGroupPreferredChild([...entries, rememberedAction], g, 'g:run')).toBe(defaultMember)
  })

  it('resolves nothing for a popover-only group without memory', () => {
    const bare = group('bare') as DevframeViewGroup
    expect(resolveGroupPreferredChild([bare, iframe('bare:x', { groupId: 'bare' })], bare, undefined)).toBeUndefined()
  })

  it('ignores a remembered action for a popover-only group', () => {
    const bare = group('bare') as DevframeViewGroup
    const rememberedAction = action('bare:run', { groupId: 'bare' })
    expect(resolveGroupPreferredChild([bare, rememberedAction], bare, 'bare:run')).toBeUndefined()
  })
})

describe('resolveRecentDockEntries', () => {
  const g = group('g')
  const member = iframe('g:member', { groupId: 'g' })
  const entries = [a, b, c, d, e, g, member]
  const groupedRail: DevframeDockEntriesGrouped = [['default', [a, b, c, d, e, g]]]

  function resolve(recentIds: string[] | null, limit = 3) {
    return resolveRecentDockEntries({ entries, groups: groupedRail, recentIds, limit })
  }

  it('resolves top-level rail entries and grouped members in order', () => {
    expect(resolve(['g:member', 'd'])).toEqual([member, d])
  })

  it('drops unknown ids and group buttons', () => {
    expect(resolve(null)).toEqual([])
    expect(resolve(['missing', 'g', 'd'])).toEqual([d])
  })

  it('drops an entry that is off the rail', () => {
    const hidden = iframe('hidden')
    expect(resolveRecentDockEntries({ entries: [...entries, hidden], groups: groupedRail, recentIds: ['hidden'], limit: 3 })).toEqual([])
  })

  it('caps the list at the limit', () => {
    expect(resolve(['d', 'e', 'g:member'], 2)).toEqual([d, e])
    expect(resolve(['d'], 0)).toEqual([])
  })
})
