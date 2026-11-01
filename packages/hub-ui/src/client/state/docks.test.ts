import type { DevframeDockEntry } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import { describe, expect, it } from 'vitest'
import { getCurrentDockId, holdsCurrentDock } from './docks'

const group = { type: 'group', id: 'tools', title: 'Tools', icon: 'i' } as DevframeDockEntry
const member = { type: 'iframe', id: 'logs', title: 'Logs', icon: 'i', url: '/', groupId: 'tools' } as DevframeDockEntry
const action = { type: 'action', id: 'reload', title: 'Reload', icon: 'i' } as DevframeDockEntry

function contextWith(selected: DevframeDockEntry | null, options: { clientType?: 'embedded' | 'standalone', open?: boolean, recent?: string[], topLevel?: DevframeDockEntry[] } = {}): DocksContext {
  // eslint-disable-next-line slop/no-chained-type-assertions -- this fixture supplies only the context fields the dock helpers read.
  return {
    clientType: options.clientType ?? 'standalone',
    panel: { session: { open: options.open ?? true, recentDockIds: options.recent } },
    docks: { selected, entries: [group, member, action], groupedEntries: [['default', options.topLevel ?? [group, action]]] },
  } as unknown as DocksContext
}

describe('getCurrentDockId', () => {
  it('is the selected view, never an action, and none while an embedded panel is closed', () => {
    expect(getCurrentDockId(contextWith(member))).toBe('logs')
    expect(getCurrentDockId(contextWith(action))).toBeUndefined()
    expect(getCurrentDockId(contextWith(null))).toBeUndefined()
    expect(getCurrentDockId(contextWith(member, { clientType: 'embedded', open: false }))).toBeUndefined()
    expect(getCurrentDockId(contextWith(member, { clientType: 'embedded', open: true }))).toBe('logs')
  })
})

describe('holdsCurrentDock', () => {
  it('holds the current dock itself and the group of a current member', () => {
    const context = contextWith(member)
    expect(holdsCurrentDock(context, member, 'logs')).toBe(true)
    expect(holdsCurrentDock(context, group, 'logs')).toBe(true)
    expect(holdsCurrentDock(context, action, 'logs')).toBe(false)
    expect(holdsCurrentDock(context, group, undefined)).toBe(false)
  })

  it('leaves the group out when the member has its own button on the bar', () => {
    expect(holdsCurrentDock(contextWith(member, { recent: ['logs'] }), group, 'logs')).toBe(false)
    expect(holdsCurrentDock(contextWith(member, { topLevel: [group, member] }), group, 'logs')).toBe(false)
  })
})
