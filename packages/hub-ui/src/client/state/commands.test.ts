import type { DevframeServerCommandEntry } from '@devframes/hub'
import type { DevframeRpcClient } from '@devframes/hub/client'
import { DEFAULT_STATE_USER_SETTINGS, HUB_EVENTS } from '@devframes/hub/constants'
import { createSharedState } from 'devframe/utils/shared-state'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCommandsContext } from './commands'

afterEach(() => vi.unstubAllGlobals())

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
