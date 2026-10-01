import type { HubUiLocale } from '../../locales'
import { matchLocale as matchHubLocale } from '@devframes/hub/client'
import { usePreferredLanguages, useStorage } from '@vueuse/core'
import { computed, ref, shallowReactive, watch } from 'vue'
import { DEFAULT_LOCALE, HUB_UI_LOCALES } from '../../locales'
import en from './locales/en.json'

/** Every UI string has a key in `en.json`; the other files translate them. */
export type MessageKey = keyof typeof en

type Messages = Partial<Record<MessageKey, string>>

/** English is bundled: it is the fallback, so `t()` never waits on a network. */
const loaders: Record<Exclude<HubUiLocale, 'en'>, () => Promise<{ default: Messages }>> = {
  'zh-CN': () => import('./locales/zh-CN.json'),
  'zh-TW': () => import('./locales/zh-TW.json'),
  'ja': () => import('./locales/ja.json'),
  'ko': () => import('./locales/ko.json'),
  'es': () => import('./locales/es.json'),
  'fr': () => import('./locales/fr.json'),
  'de': () => import('./locales/de.json'),
  'pt-BR': () => import('./locales/pt-BR.json'),
  'ru': () => import('./locales/ru.json'),
}

const loaded = shallowReactive<Partial<Record<HubUiLocale, Messages>>>({ en })
const pending = new Map<HubUiLocale, Promise<void>>()

/**
 * Fetch the chunk for `code` once. `t()` reads `loaded` reactively, so the UI
 * shows English until the chunk lands, then re-renders in the new language.
 */
export function loadLocale(code: HubUiLocale): Promise<void> {
  if (loaded[code])
    return Promise.resolve()
  let request = pending.get(code)
  if (!request) {
    request = loaders[code as keyof typeof loaders]()
      .then((module) => {
        loaded[code] = module.default
      })
      .catch(() => {
        // Stay on English, and allow a retry on the next pick.
      })
      .finally(() => pending.delete(code))
    pending.set(code, request)
  }
  return request
}

export type LocalePreference = 'auto' | HubUiLocale

/** Narrow a BCP 47 tag to a shipped locale (`zh-HK` → `zh-TW`, `pt-PT` → `pt-BR`, `en-GB` → `en`). */
export function matchLocale(tag: string | undefined): HubUiLocale | undefined {
  // `matchHubLocale` only returns members of the list it was given.
  return matchHubLocale(tag, Object.keys(HUB_UI_LOCALES)) as HubUiLocale | undefined
}

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

watch(locale, code => void loadLocale(code), { immediate: true })

/** Seed the `auto` choice from `ConnectionMeta.configs.ui.locale`. */
export function setHostLocale(tag: string | undefined): void {
  hostLocale.value = matchLocale(tag)
}

export function setLocalePreference(preference: LocalePreference): void {
  localePreference.value = preference
}

/** Translate `key` in the current locale, filling `{name}` slots from `params`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const message = loaded[locale.value]?.[key] ?? en[key]
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
