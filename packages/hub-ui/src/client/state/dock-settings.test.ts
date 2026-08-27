import type { DevframeDockEntriesGrouped, DevframeDockEntry, DevframeViewGroup } from '@devframes/hub'
import { describe, expect, it } from 'vitest'
import { docksSplitGroupsWithCapacity, resolveNextRecentDockId, resolveRecentDockEntry } from './dock-settings'

function iframe(id: string, extra: Partial<DevframeDockEntry> = {}): DevframeDockEntry {
  return { id, type: 'iframe', url: '/', title: id.toUpperCase(), icon: 'ph:cube-duotone', ...extra } as DevframeDockEntry
}

function group(id: string, extra: Partial<DevframeViewGroup> = {}): DevframeDockEntry {
  return { id, type: 'group', title: id.toUpperCase(), icon: 'ph:folder-duotone', ...extra } as DevframeDockEntry
}

function ids(groups: DevframeDockEntriesGrouped): string[] {
  return groups.flatMap(([, items]) => items.map(item => item.id))
}

// Five top-level docks on a 3-slot bar: [a] [b] [c] | [overflow: d, e]
const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map(id => iframe(id))
const rail: DevframeDockEntriesGrouped = [['default', [a, b, c, d, e]]]

describe('docksSplitGroupsWithCapacity', () => {
  it('splits naturally without a recent entry', () => {
    const split = docksSplitGroupsWithCapacity(rail, 3)
    expect(ids(split.visible)).toEqual(['a', 'b', 'c'])
    expect(ids(split.overflow)).toEqual(['d', 'e'])
    expect(split.recent).toBeNull()
  })

  it('reserves a slot for a recent entry from the overflow', () => {
    const split = docksSplitGroupsWithCapacity(rail, 3, d)
    expect(ids(split.visible)).toEqual(['a', 'b'])
    expect(ids(split.overflow)).toEqual(['c', 'e'])
    expect(split.recent).toBe(d)
  })

  it('renders a recent entry inside the natural slice in place, releasing the slot', () => {
    const split = docksSplitGroupsWithCapacity(rail, 3, c)
    expect(ids(split.visible)).toEqual(['a', 'b', 'c'])
    expect(ids(split.overflow)).toEqual(['d', 'e'])
    expect(split.recent).toBeNull()
  })

  it('raises a grouped member without touching the rail items in the overflow', () => {
    const g = group('g')
    const member = iframe('g:member', { groupId: 'g' })
    const groupedRail: DevframeDockEntriesGrouped = [['default', [a, b, g, c, d]]]
    const split = docksSplitGroupsWithCapacity(groupedRail, 3, member)
    expect(ids(split.visible)).toEqual(['a', 'b'])
    expect(ids(split.overflow)).toEqual(['g', 'c', 'd'])
    expect(split.recent).toBe(member)
  })

  it('skips the reservation when there is no overflow', () => {
    const member = iframe('g:member', { groupId: 'g' })
    const smallRail: DevframeDockEntriesGrouped = [['default', [a, b, c]]]
    const split = docksSplitGroupsWithCapacity(smallRail, 3, member)
    expect(ids(split.visible)).toEqual(['a', 'b', 'c'])
    expect(split.overflow).toEqual([])
    expect(split.recent).toBeNull()
  })

  it('keeps the lone-overflow fold ahead of the reservation', () => {
    const foldRail: DevframeDockEntriesGrouped = [['default', [a, b, c, d]]]
    const split = docksSplitGroupsWithCapacity(foldRail, 3, d)
    expect(ids(split.visible)).toEqual(['a', 'b', 'c', 'd'])
    expect(split.overflow).toEqual([])
    expect(split.recent).toBeNull()
  })
})

describe('resolveNextRecentDockId', () => {
  function next(recentEntry: DevframeDockEntry | null, selected: DevframeDockEntry, selectedIsGroupMember = false) {
    return resolveNextRecentDockId({ groups: rail, capacity: 3, recentEntry, selected, selectedIsGroupMember })
  }

  it('follows the a–e walkthrough on a 3-slot bar', () => {
    // [a] [b] [c] | [O] — selecting d from the overflow raises it
    expect(next(null, d)).toBe('d')
    // [a] [b] | {d} [O] — selecting visible a/b (or d itself) keeps d raised
    expect(next(d, a)).toBe('d')
    expect(next(d, b)).toBe('d')
    expect(next(d, d)).toBe('d')
    // [a] [b] | [d] [O] — selecting e from the overflow replaces d
    expect(next(d, e)).toBe('e')
    // selecting c (folded out by the reserved slot) becomes recent, and the
    // split renders it in its natural place — back to [a] [b] {c} | [O]
    expect(next(d, c)).toBe('c')
    expect(docksSplitGroupsWithCapacity(rail, 3, c).recent).toBeNull()
  })

  it('always raises a grouped member', () => {
    const member = iframe('g:member', { groupId: 'g' })
    expect(next(null, member, true)).toBe('g:member')
    expect(next(d, member, true)).toBe('g:member')
  })

  it('keeps the recent dock when the selection is off the rail entirely', () => {
    expect(next(d, iframe('~notice'))).toBe('d')
    expect(next(null, iframe('~notice'))).toBeNull()
  })

  it('keeps a naturally-visible selection from claiming the slot', () => {
    expect(next(null, a)).toBeNull()
  })
})

describe('resolveRecentDockEntry', () => {
  const g = group('g')
  const member = iframe('g:member', { groupId: 'g' })
  const entries = [a, b, c, d, e, g, member]
  const groupedRail: DevframeDockEntriesGrouped = [['default', [a, b, c, d, e, g]]]

  function resolve(recentId: string | null) {
    return resolveRecentDockEntry({ entries, groups: groupedRail, recentId })
  }

  it('resolves a top-level rail entry', () => {
    expect(resolve('d')).toBe(d)
  })

  it('resolves a grouped member', () => {
    expect(resolve('g:member')).toBe(member)
  })

  it('returns null for no id, an unknown id, or a group button', () => {
    expect(resolve(null)).toBeNull()
    expect(resolve('missing')).toBeNull()
    expect(resolve('g')).toBeNull()
  })

  it('returns null for an entry that is off the rail', () => {
    const hidden = iframe('hidden')
    expect(resolveRecentDockEntry({ entries: [...entries, hidden], groups: groupedRail, recentId: 'hidden' })).toBeNull()
  })
})
