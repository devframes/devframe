import type { DevframeCommandEntry } from '@devframes/hub'
import type { WhenContext } from 'devframe/utils/when'
import { describe, expect, it } from 'vitest'
import { resolveDockContextMenu } from './dock-context-menu'

const ctx: WhenContext = {
  clientType: 'embedded',
  dockOpen: false,
  paletteOpen: false,
  dockSelectedId: '',
}

const commands: DevframeCommandEntry[] = [
  {
    id: 'svelte:settings',
    title: 'Inspector Settings',
    icon: 'ph:gear-duotone',
    source: 'server',
  },
  {
    id: 'svelte:hold',
    title: 'Hold Mode',
    source: 'client',
    action: () => {},
  },
  {
    id: 'svelte:group',
    title: 'Group',
    source: 'client',
    children: [
      {
        id: 'svelte:child',
        title: 'Child',
        source: 'client',
        action: () => {},
      },
    ],
  },
  {
    id: 'svelte:standalone-only',
    title: 'Standalone',
    source: 'client',
    when: 'clientType == standalone',
    action: () => {},
  },
]

describe('resolveDockContextMenu', () => {
  it('returns nothing without items', () => {
    expect(resolveDockContextMenu(undefined, commands, ctx, 'en')).toEqual([])
  })

  it('falls back to the title and icon of the command', () => {
    expect(resolveDockContextMenu([
      { command: 'svelte:settings' },
    ], commands, ctx, 'en')).toEqual([
      {
        type: 'command',
        command: 'svelte:settings',
        args: [],
        title: 'Inspector Settings',
        icon: 'ph:gear-duotone',
        checked: undefined,
      },
    ])
  })

  it('uses the item title, locales, icon, args and checked', () => {
    const [item] = resolveDockContextMenu([
      {
        command: 'svelte:hold',
        title: 'Hold',
        titleLocales: { fr: 'Maintenir' },
        icon: 'ph:hand-duotone',
        args: [true],
        checked: true,
      },
    ], commands, ctx, 'fr')
    expect(item).toEqual({
      type: 'command',
      command: 'svelte:hold',
      args: [true],
      title: 'Maintenir',
      icon: 'ph:hand-duotone',
      checked: true,
    })
  })

  it('drops unknown, unavailable and action-less commands', () => {
    const items = resolveDockContextMenu([
      { command: 'missing' },
      { command: 'svelte:standalone-only' },
      { command: 'svelte:group' },
      { command: 'svelte:hold', when: 'clientType == standalone' },
      { command: 'svelte:child' },
    ], commands, ctx, 'en')
    expect(items.map(item => item.type === 'command' && item.command)).toEqual(['svelte:child'])
  })

  it('trims and merges separators', () => {
    const items = resolveDockContextMenu([
      { type: 'separator' },
      { command: 'svelte:settings' },
      { type: 'separator' },
      { command: 'missing' },
      { type: 'separator' },
      { command: 'svelte:hold' },
      { type: 'separator' },
      { type: 'separator' },
    ], commands, ctx, 'en')
    expect(items.map(item => item.type)).toEqual(['command', 'separator', 'command'])
  })
})
