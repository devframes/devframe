import type { DevframeRpcClient } from '@devframes/hub/client'
import { storeConnection } from '@devframes/hub/client'
import { watch } from 'vue'
import { locale, setHostLocale } from '../i18n'

/**
 * Seed the language from `ConnectionMeta.configs.ui.locale` (the host's
 * `createUi({ locale })`), then keep the effective language published back
 * there: a same-origin frame inherits this window's connection when it boots,
 * so its own UI can follow the hub's pick without a second handshake.
 */
export function setupLocale(rpc: DevframeRpcClient): void {
  setHostLocale(rpc.connectionMeta.configs?.ui?.locale)
  watch(locale, (value) => {
    const configs = rpc.connectionMeta.configs ??= {}
    ;(configs.ui ??= {}).locale = value
    storeConnection(rpc.connection)
  }, { immediate: true })
}
