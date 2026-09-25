import type { DevframeDocksUserSettings } from '@devframes/hub'
import type { DevframeRpcClient } from '@devframes/hub/client'
import { createSharedState } from 'devframe/utils/shared-state'
import { afterEach, expect, it, vi } from 'vitest'
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
