import type { DevframeDocksUserSettings, DevframeServerCommandEntry } from '@devframes/hub'
import type { DevframeRpcClient } from '@devframes/hub/client'
import { DEFAULT_STATE_USER_SETTINGS, HUB_EVENTS } from '@devframes/hub/constants'
import { createSharedState } from 'devframe/utils/shared-state'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { createCommandsContext } from './commands'
import { isMac } from './keybindings'
import { useDockPopupWindow } from './popup'

vi.mock('./popup', () => ({
  useDockPopupWindow: vi.fn(() => shallowRef(null)),
  useIsDockPopupOpen: () => shallowRef(false),
}))

afterEach(() => vi.unstubAllGlobals())

it.each(['standalone', 'shadow-root', 'popup'] as const)('leaves recording keystrokes untouched in %s and resumes shortcuts outside the recorder', async (mode) => {
  const listeners = new Map<string, (event: KeyboardEvent) => void>()
  const host = { addEventListener: vi.fn((name, handler) => listeners.set(name, handler)) }
  vi.stubGlobal('window', host)
  const popup = shallowRef<Window | null>(null)
  vi.mocked(useDockPopupWindow).mockReturnValue(popup)
  const scope = effectScope()
  try {
    // eslint-disable-next-line slop/no-chained-type-assertions -- only sharedState is used by this command context fixture.
    const rpc = {
      sharedState: { get: async () => createSharedState({ initialValue: [] }) },
    } as unknown as DevframeRpcClient
    const settings = createSharedState<DevframeDocksUserSettings>({
      initialValue: { docksHidden: [], docksCategoriesHidden: [], docksPinned: [], docksCustomOrder: {}, commandShortcuts: {} },
    })
    const context = await scope.run(() => createCommandsContext('standalone', rpc, settings))!
    const action = vi.fn()
    context.register({ id: 'test:palette', source: 'client', title: 'Palette', keybindings: [{ key: 'Mod+K' }], action })
    if (mode === 'popup') {
      // eslint-disable-next-line slop/no-chained-type-assertions -- the popup fixture only needs the listener registration surface.
      popup.value = host as unknown as Window
      await nextTick()
    }
    const recorder = Object.assign(new EventTarget(), { classList: { contains: (name: string) => name === 'shortcut-key-input' } })
    const outside = Object.assign(new EventTarget(), { classList: { contains: () => false } })
    // eslint-disable-next-line slop/no-chained-type-assertions -- Node has no KeyboardEvent; this fixture supplies the fields the shortcut listener reads.
    const event = Object.assign(new Event('keydown'), {
      key: 'k',
      metaKey: isMac,
      ctrlKey: !isMac,
      composedPath: () => [recorder, outside],
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }) as unknown as KeyboardEvent
    Object.defineProperty(event, 'target', { value: mode === 'shadow-root' ? outside : recorder })
    const handler = listeners.get('keydown')!
    handler(event)
    expect(action).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()

    event.composedPath = () => [outside]
    handler(event)
    expect(action).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
  }
  finally {
    scope.stop()
  }
})

describe('command shortcut eligibility', () => {
  it('ignores saved and default bindings while preserving explicit calls and palette shortcuts', async () => {
    const command = {
      id: 'tool:open-file',
      title: 'Open File',
      source: 'server',
      showInPalette: false,
      allowShortcuts: false,
      keybindings: [{ key: 'Alt+E' }],
    } satisfies DevframeServerCommandEntry
    const serverState = createSharedState<DevframeServerCommandEntry[]>({ initialValue: [command] })
    const settings = createSharedState({
      initialValue: {
        ...DEFAULT_STATE_USER_SETTINGS(),
        commandShortcuts: { [command.id]: [{ key: 'Alt+Y' }] },
      },
    })
    const call = vi.fn()
    // eslint-disable-next-line slop/no-chained-type-assertions -- the command context only needs these two RPC APIs.
    const rpc = { sharedState: { get: async () => serverState }, call } as unknown as DevframeRpcClient
    const window = new EventTarget()
    vi.stubGlobal('window', window)
    const context = await createCommandsContext('embedded', rpc, settings)
    const openPalette = vi.fn()
    context.register({
      id: 'tool:palette',
      title: 'Toggle Palette',
      source: 'client',
      showInPalette: false,
      keybindings: [{ key: 'Alt+K' }],
      action: openPalette,
    })

    const press = (key: string) => window.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), {
      key,
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    }))

    const unhandled = press('y')
    expect(call).not.toHaveBeenCalled()
    expect(unhandled).toBe(true)
    expect(context.getKeybindings(command.id)).toEqual([])
    settings.mutate((state) => {
      delete state.commandShortcuts[command.id]
    })
    expect(press('e')).toBe(true)
    expect(call).not.toHaveBeenCalled()

    press('k')
    expect(openPalette).toHaveBeenCalledOnce()
    await context.execute(command.id, 'src/main.ts')
    expect(call).toHaveBeenCalledExactlyOnceWith(HUB_EVENTS.rpc.commandsExecute, command.id, 'src/main.ts')
  })
})
