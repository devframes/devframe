import type { DevframeRpcClient } from '@devframes/hub/client'
import type { ConnectionMeta } from 'devframe/types'
import { getDevframeConnection } from '@devframes/hub/client'
import { afterEach, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { setHostLocale, setLocalePreference } from '../i18n'
import { setupLocale } from './locale'

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
