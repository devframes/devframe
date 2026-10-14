import type { DevframeDockEntry } from '@devframes/hub'
import type { DevframeRpcClient } from '@devframes/hub/client'
import type { ConnectionMeta } from 'devframe/types'
import { getDevframeConnection } from '@devframes/hub/client'
import { DEFAULT_STATE_USER_SETTINGS } from '@devframes/hub/constants'
import { afterEach, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { BUILTIN_ENTRY_SETTINGS } from '../constants'
import { setHostLocale, setLocalePreference, t } from '../i18n'
import { docksGroupByCategories } from './dock-settings'
import { localizeCommand, localizeTitle, setupLocale } from './locale'

function createRpc(connectionMeta: ConnectionMeta): DevframeRpcClient {
  // Only the connection surface `setupLocale` touches.
  return { connectionMeta, connection: { connectionMeta, metaBaseUrl: '/' } } as DevframeRpcClient
}

afterEach(() => {
  setLocalePreference('auto')
  setHostLocale(undefined)
})

it('publishes the effective locale to same-origin frames and follows the visitor pick', async () => {
  const rpc = createRpc({ backend: 'websocket', configs: { ui: { locale: 'ja' } } })
  setupLocale(rpc)

  expect(getDevframeConnection()?.connectionMeta.configs?.ui?.locale).toBe('ja')

  setLocalePreference('de')
  await nextTick()

  expect(rpc.connectionMeta.configs?.ui?.locale).toBe('de')
  expect(getDevframeConnection()?.connectionMeta.configs?.ui?.locale).toBe('de')
})

it('publishes the fallback when the host sets no locale', () => {
  const rpc = createRpc({ backend: 'websocket' })
  setupLocale(rpc)

  expect(rpc.connectionMeta.configs?.ui?.locale).toBe('en')
})

it('localizes a command tree in the current UI language', () => {
  setLocalePreference('ja')
  const command = localizeCommand({
    id: 'build',
    source: 'client',
    title: 'Build',
    titleLocales: { ja: 'ビルド' },
    children: [{ id: 'build:clean', source: 'client', title: 'Clean', titleLocales: { ja: 'クリーン' } }],
  })

  expect(command.title).toBe('ビルド')
  expect(command.children?.[0]?.title).toBe('クリーン')
})

it.each(['en', 'zh-CN', 'ja'] as const)('keeps dock order and custom weights when the locale is %s', (language) => {
  setLocalePreference(language)
  const entries: DevframeDockEntry[] = [
    { id: 'assets', type: 'iframe', url: '/', icon: 'ph:cube', title: 'Assets', titleLocales: { 'zh-CN': '资源', 'ja': 'アセット' }, category: '~builtin' },
    { id: 'terminals', type: 'iframe', url: '/', icon: 'ph:cube', title: 'Terminals', category: '~builtin' },
    { id: 'first', type: 'iframe', url: '/', icon: 'ph:cube', title: 'First', category: '~builtin', defaultOrder: -1 },
  ]
  const localized = [...entries.map(entry => localizeTitle(entry)), localizeTitle(BUILTIN_ENTRY_SETTINGS, t('dock.settings'))]
  const settings = DEFAULT_STATE_USER_SETTINGS()
  const order = () => docksGroupByCategories(localized, settings).flatMap(([, items]) => items.map(item => item.id))

  expect(order()).toEqual(['first', 'terminals', '~settings', 'assets'])
  expect(localized.at(-1)?.title).toBe(t('dock.settings'))

  settings.docksCustomOrder = { 'assets': -2, '~settings': -1, 'first': 1, 'terminals': 2 }
  expect(order()).toEqual(['assets', '~settings', 'first', 'terminals'])
  expect(settings.docksCustomOrder).toEqual({ 'assets': -2, '~settings': -1, 'first': 1, 'terminals': 2 })
})
