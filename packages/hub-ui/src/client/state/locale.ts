import type { DevframeCommandEntry, DevframeTitled } from '@devframes/hub'
import type { DevframeRpcClient } from '@devframes/hub/client'
import { resolveTitle, storeConnection } from '@devframes/hub/client'
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

/** A copy of a dock entry, command or launcher with `title` in the current UI language. */
export function localizeTitle<T extends DevframeTitled>(titled: T): T {
  return { ...titled, title: resolveTitle(titled, locale.value) }
}

/** `localizeTitle` for a command and its children, so palette and shortcut rows follow the language. */
export function localizeCommand<T extends DevframeCommandEntry>(command: T): T {
  const children = command.children?.map(child => localizeCommand(child))
  return { ...localizeTitle(command), ...(children ? { children } : {}) }
}
