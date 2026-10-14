import type { DevframeViewIframe } from '@devframes/hub'
import type { DevframeRpcClient } from '@devframes/hub/client'
import { createEventEmitter } from 'devframe/utils/events'
import { createSharedState } from 'devframe/utils/shared-state'
import { afterEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { loadLocale, setLocalePreference } from '../i18n'
import { createDocksContext } from './context'

function createRpc(): DevframeRpcClient {
  // The transport is in memory; registration, localization and sorting use the real context.
  // eslint-disable-next-line slop/no-chained-type-assertions -- this fixture supplies only the RPC surface used by the context.
  return {
    sharedState: { get: async (_key: string, options: { initialValue: object }) => createSharedState({ initialValue: options.initialValue }) },
    connectionMeta: {},
    events: createEventEmitter(),
    client: { register: vi.fn() },
    isTrusted: false,
  } as unknown as DevframeRpcClient
}

afterEach(() => setLocalePreference('auto'))

it.each(['embedded', 'standalone'] as const)('preserves title updates and ordering through the %s context', async (mode) => {
  setLocalePreference('en')
  const context = await createDocksContext(mode, createRpc())
  const handle = context.docks.register<DevframeViewIframe>({ id: 'demo', type: 'iframe', title: 'Old title', icon: 'ph:cube', url: '/' })
  context.docks.register({ id: 'peer', type: 'iframe', title: 'Middle', icon: 'ph:cube', url: '/' })
  const entry = () => context.docks.entries.find(item => item.id === 'demo')!
  const order = () => context.docks.groupedEntries.flatMap(([, items]) => items.map(item => item.id)).filter(id => id !== '~settings')
  expect(order()).toEqual(['demo', 'peer'])

  context.docks.update({ ...entry(), title: 'A new title' })
  await nextTick()
  expect(entry().title).toBe('A new title')
  expect(context.docks.getStateById('demo')?.entryMeta.title).toBe('A new title')
  expect(order()).toEqual(['peer', 'demo'])

  handle.update({ titleLocales: { ja: '日本語のタイトル' } })
  await loadLocale('ja')
  setLocalePreference('ja')
  await nextTick()
  expect(entry().title).toBe('日本語のタイトル')
  expect(order()).toEqual(['peer', 'demo'])
  context.docks.update({ ...entry(), icon: 'ph:star' })
  setLocalePreference('en')
  await nextTick()
  expect(entry().title).toBe('A new title')

  handle.update({ title: 'Z title' })
  await nextTick()
  expect(entry().title).toBe('Z title')
  expect(order()).toEqual(['demo', 'peer'])
  context.docks.settings.mutate((state) => {
    state.docksCustomOrder = { peer: -1, demo: 1 }
  })
  await nextTick()
  for (const language of ['ja', 'en'] as const) {
    setLocalePreference(language)
    await nextTick()
    expect(order()).toEqual(['peer', 'demo'])
  }
  handle.dispose()
})
