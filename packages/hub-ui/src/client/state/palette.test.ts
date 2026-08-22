import type { DevframeCommandEntry } from '@devframes/hub'
import { describe, expect, it } from 'vitest'
import { flattenPaletteCommands, paletteScopeTrail } from './palette'

/**
 * The shape the palette actually sees: dock navigation two deep (`Docks` › a
 * group › its members), plus the two `showInPalette` opt-outs a host can set.
 */
const commands = [
  {
    id: 'devframes:docks',
    source: 'client',
    title: 'Docks',
    children: [
      { id: 'devframes:docks:overview', source: 'client', title: 'Overview' },
      {
        id: 'devframes:docks:tools',
        source: 'client',
        title: 'Tools',
        children: [
          { id: 'devframes:docks:tools:a', source: 'client', title: 'A' },
          { id: 'devframes:docks:tools:b', source: 'client', title: 'B' },
        ],
      },
    ],
  },
  {
    id: 'host:drill',
    source: 'client',
    title: 'Drill',
    showInPalette: 'without-children',
    children: [
      {
        id: 'host:drill:child',
        source: 'client',
        title: 'Child',
        children: [{ id: 'host:drill:grandchild', source: 'client', title: 'Grandchild' }],
      },
    ],
  },
  {
    id: 'host:hidden',
    source: 'client',
    title: 'Hidden',
    showInPalette: false,
    children: [{ id: 'host:hidden:child', source: 'client', title: 'Hidden child' }],
  },
] as unknown as DevframeCommandEntry[]

describe('flattenPaletteCommands', () => {
  it('lists a nested command with its full path for search and its parent for display', () => {
    const rows = flattenPaletteCommands(commands)
    const row = rows.find(r => r.entry.id === 'devframes:docks:tools:b')

    expect(row).toEqual({
      entry: expect.objectContaining({ id: 'devframes:docks:tools:b' }),
      parentTitle: 'Tools',
      searchTitle: 'Docks > Tools > B',
    })
  })

  it('omits `parentTitle` for a top-level command', () => {
    const rows = flattenPaletteCommands(commands)

    expect(rows.find(r => r.entry.id === 'devframes:docks')).not.toHaveProperty('parentTitle')
  })

  it('keeps the whole subtree of `showInPalette: without-children` out of root search', () => {
    const ids = flattenPaletteCommands(commands).map(r => r.entry.id)

    expect(ids).toContain('host:drill')
    expect(ids).not.toContain('host:drill:child')
    expect(ids).not.toContain('host:drill:grandchild')
  })

  it('drops a `showInPalette: false` command along with its children', () => {
    const ids = flattenPaletteCommands(commands).map(r => r.entry.id)

    expect(ids).not.toContain('host:hidden')
    expect(ids).not.toContain('host:hidden:child')
  })
})

describe('paletteScopeTrail', () => {
  it('builds the crumb stack a user would have clicked to reach the scope', () => {
    const trail = paletteScopeTrail(commands, 'devframes:docks:tools')

    expect(trail.map(c => c.title)).toEqual(['Docks', 'Tools'])
    expect(trail.at(-1)!.items.map(i => i.id)).toEqual([
      'devframes:docks:tools:a',
      'devframes:docks:tools:b',
    ])
  })

  it('opens the root list for no scope', () => {
    expect(paletteScopeTrail(commands, null)).toEqual([])
  })

  it('opens the root list when the scoped command is gone', () => {
    expect(paletteScopeTrail(commands, 'devframes:docks:unregistered')).toEqual([])
  })

  it('opens the root list for a command with nothing to drill into', () => {
    expect(paletteScopeTrail(commands, 'devframes:docks:overview')).toEqual([])
  })
})
