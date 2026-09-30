import type { HubUiLocale } from '../../locales'
import { usePreferredLanguages, useStorage } from '@vueuse/core'
import { computed, ref } from 'vue'
import { DEFAULT_LOCALE, matchLocale } from '../../locales'
import de from './locales/de.json'
import en from './locales/en.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'
import ptBR from './locales/pt-BR.json'
import ru from './locales/ru.json'
import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'

/** Every UI string has a key in `en.json`; the other files translate them. */
export type MessageKey = keyof typeof en

export const messages: Record<HubUiLocale, Partial<Record<MessageKey, string>>> = {
  'en': en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ja,
  ko,
  es,
  fr,
  de,
  'pt-BR': ptBR,
  ru,
}

export type LocalePreference = 'auto' | HubUiLocale

/**
 * The visitor's pick, per browser like the color scheme. `auto` follows the
 * host default (`createUi({ locale })`), then the browser language.
 */
export const localePreference = useStorage<LocalePreference>('devframes-locale', 'auto')

const hostLocale = ref<HubUiLocale>()
const browserLanguages = usePreferredLanguages()

/** The language the UI renders in right now. */
export const locale = computed<HubUiLocale>(() => {
  if (localePreference.value !== 'auto') {
    const picked = matchLocale(localePreference.value)
    if (picked)
      return picked
  }
  if (hostLocale.value)
    return hostLocale.value
  for (const tag of browserLanguages.value) {
    const matched = matchLocale(tag)
    if (matched)
      return matched
  }
  return DEFAULT_LOCALE
})

/** Seed the `auto` choice from `ConnectionMeta.configs.ui.locale`. */
export function setHostLocale(tag: string | undefined): void {
  hostLocale.value = matchLocale(tag)
}

export function setLocalePreference(preference: LocalePreference): void {
  localePreference.value = preference
}

/** Translate `key` in the current locale, filling `{name}` slots from `params`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const message = messages[locale.value][key] ?? en[key]
  if (!params)
    return message
  return message.replace(/\{(\w+)\}/g, (slot, name: string) => name in params ? String(params[name]) : slot)
}

/**
 * `t()` split around one `{slot}`, for a template that wraps that slot in its
 * own element (a highlighted term, a code span) and needs the surrounding
 * words in the locale's word order.
 */
export function tAround(key: MessageKey, slot: string, params?: Record<string, string | number>): [before: string, after: string] {
  const marker = '\u0000'
  const [before = '', after = ''] = t(key, { ...params, [slot]: marker }).split(marker)
  return [before, after]
}
