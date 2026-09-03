import type { DevframeCommandEntry, DevframeCommandKeybinding } from '@devframes/hub'
import type { WhenContext } from 'devframe/utils/when'
import { describe, expect, it } from 'vitest'
import { collectAllKeybindings, filterCommandsByWhen, findCommandDeep, walkCommands } from './keybindings'

/**
 * Dock-navigation commands nest two deep (`Docks` › a group › its members), and
 * a devframe is free to register its own `children` deeper still; this tree carries
 * a third level so the traversal is exercised past any fixed depth.
 */
const commands = [
  {
    id: 'devframes:docks',
    source: 'client',
    title: 'Docks',
    children: [
      { id: 'devframes:docks:overview', source: 'client', title: 'Overview' },
      {
        id: 'devframes:docks:playground',
        source: 'client',
        title: 'Playground',
        children: [
          { id: 'devframes:docks:playground:one', source: 'client', title: 'One' },
          { id: 'devframes:docks:playground:two', source: 'client', title: 'Two' },
        ],
      },
      {
        id: 'devframes:docks:tools',
        source: 'client',
        title: 'Tools',
        children: [
          {
            id: 'host:tools:submenu',
            source: 'client',
            title: 'Advanced',
            children: [
              { id: 'devframes:docks:tools:graph', source: 'client', title: 'Graph' },
            ],
          },
        ],
      },
    ],
  },
] as DevframeCommandEntry[]

const whenContext: WhenContext = {
  clientType: 'embedded',
  dockOpen: true,
  paletteOpen: false,
  dockSelectedId: '',
  popupOpen: false,
}

describe('walkCommands', () => {
  it('visits every command at every depth, parents before children', () => {
    const seen: Array<[string, number]> = []
    walkCommands(commands, (cmd, ancestors) => {
      seen.push([cmd.id, ancestors.length])
    })

    expect(seen).toEqual([
      ['devframes:docks', 0],
      ['devframes:docks:overview', 1],
      ['devframes:docks:playground', 1],
      ['devframes:docks:playground:one', 2],
      ['devframes:docks:playground:two', 2],
      ['devframes:docks:tools', 1],
      ['host:tools:submenu', 2],
      ['devframes:docks:tools:graph', 3],
    ])
  })

  it('hands each command its ancestor chain, outermost first', () => {
    let ancestorTitles: string[] = []
    walkCommands(commands, (cmd, ancestors) => {
      if (cmd.id === 'devframes:docks:tools:graph')
        ancestorTitles = ancestors.map(a => a.title)
    })

    expect(ancestorTitles).toEqual(['Docks', 'Tools', 'Advanced'])
  })

  it('leaves a subtree unvisited when the visitor returns `skip`', () => {
    const seen: string[] = []
    walkCommands(commands, (cmd) => {
      seen.push(cmd.id)
      if (cmd.id === 'devframes:docks:playground')
        return 'skip'
    })

    expect(seen).toEqual([
      'devframes:docks',
      'devframes:docks:overview',
      'devframes:docks:playground',
      'devframes:docks:tools',
      'host:tools:submenu',
      'devframes:docks:tools:graph',
    ])
  })

  it('ends the walk from any depth when the visitor returns `stop`', () => {
    const seen: string[] = []
    walkCommands(commands, (cmd) => {
      seen.push(cmd.id)
      if (cmd.id === 'devframes:docks:playground:one')
        return 'stop'
    })

    expect(seen).toEqual([
      'devframes:docks',
      'devframes:docks:overview',
      'devframes:docks:playground',
      'devframes:docks:playground:one',
    ])
  })
})

describe('findCommandDeep', () => {
  it('finds a group member nested two levels down', () => {
    expect(findCommandDeep(commands, 'devframes:docks:playground:two')?.title).toBe('Two')
  })

  it('finds a command below a devframe submenu, three levels down', () => {
    expect(findCommandDeep(commands, 'devframes:docks:tools:graph')?.title).toBe('Graph')
  })

  it('returns undefined for an unknown id', () => {
    expect(findCommandDeep(commands, 'devframes:docks:nope')).toBeUndefined()
  })
})

describe('collectAllKeybindings', () => {
  it('collects bindings from nested commands at any depth', () => {
    const bound: Record<string, DevframeCommandKeybinding[]> = {
      'devframes:docks:playground:two': [{ key: 'Mod+2' }],
      'devframes:docks:tools:graph': [{ key: 'Mod+G' }],
    }

    const result = collectAllKeybindings(
      { value: commands },
      id => bound[id] ?? [],
    )

    expect(result).toEqual([
      { id: 'devframes:docks:playground:two', keybinding: { key: 'Mod+2' } },
      { id: 'devframes:docks:tools:graph', keybinding: { key: 'Mod+G' } },
    ])
  })
})

describe('filterCommandsByWhen', () => {
  it('evaluates `when` on descendants at every depth', () => {
    const withWhen = [
      {
        id: 'root',
        source: 'client',
        title: 'Root',
        children: [
          {
            id: 'branch',
            source: 'client',
            title: 'Branch',
            children: [
              { id: 'kept', source: 'client', title: 'Kept' },
              { id: 'dropped', source: 'client', title: 'Dropped', when: 'clientType == standalone' },
            ],
          },
        ],
      },
    ] as DevframeCommandEntry[]

    const [root] = filterCommandsByWhen(withWhen, whenContext)
    const branch = root?.children?.[0] as DevframeCommandEntry | undefined

    expect(branch?.children?.map(c => c.id)).toEqual(['kept'])
  })

  it('drops a whole subtree when the parent itself is unavailable', () => {
    const withWhen = [
      {
        id: 'root',
        source: 'client',
        title: 'Root',
        when: 'clientType == standalone',
        children: [{ id: 'child', source: 'client', title: 'Child' }],
      },
    ] as DevframeCommandEntry[]

    expect(filterCommandsByWhen(withWhen, whenContext)).toEqual([])
  })
})
