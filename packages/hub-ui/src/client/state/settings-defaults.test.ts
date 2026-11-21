import type { DocksContext } from '@devframes/hub/client'
import type { DevframeConnectionConfigsRegistry } from 'devframe/types'
import { DEFAULT_STATE_USER_SETTINGS } from '@devframes/hub/constants'
import { createSharedState } from 'devframe/utils/shared-state'
import { describe, expect, it } from 'vitest'
import { useSettings } from './settings-defaults'

/** A context whose connection meta carries the host-published `ui` config. */
function createContext(ui?: DevframeConnectionConfigsRegistry['ui']): DocksContext {
  const context = {
    rpc: {
      connectionMeta: {
        configs: ui
          ? { ui }
          : {},
      },
    },
    docks: {
      settings: createSharedState({
        initialValue: DEFAULT_STATE_USER_SETTINGS(),
      }),
    },
  }
  // eslint-disable-next-line slop/no-chained-type-assertions -- `useSettings` reads only `rpc.connectionMeta` and `docks.settings`, so the fixture carries just those.
  return context as unknown as DocksContext
}

describe('settings defaults published by the host', () => {
  it('applies the host default under the stored value', () => {
    expect.assertions(2)

    const context = createContext({
      settingsDefaults: {
        docksRecentLimit: 0,
        docksCustomOrder: { 'dock-a': 1 },
      },
    })
    context.docks.settings.mutate((state) => {
      state.docksCustomOrder['dock-b'] = 2
    })

    expect(useSettings(context).value.docksRecentLimit).toBe(0)
    expect(useSettings(context).value.docksCustomOrder).toEqual({ 'dock-a': 1, 'dock-b': 2 })
  })

  it('lets the visitor\'s own value win over the host default', () => {
    expect.assertions(1)

    const context = createContext({
      settingsDefaults: { docksRecentLimit: 0 },
    })
    context.docks.settings.mutate((state) => {
      state.docksRecentLimit = 5
    })

    expect(useSettings(context).value.docksRecentLimit).toBe(5)
  })

  it('keeps the built-in hub-ui defaults when the host publishes nothing', () => {
    expect.assertions(3)

    const context = createContext()
    const settings = useSettings(context).value

    expect(settings.docksRecentLimit).toBe(3)
    expect(settings.autoCollapseEdgeToolbar).toBe(true)
    expect(settings.showDevframeInspector).toBe(false)
  })
})
