/**
 * UI languages the reference hub-ui ships translations for, keyed by BCP 47
 * tag with the language's own name as the picker label. Framework-free like
 * `./types.ts` so the node entry can type `createUi({ locale })` without
 * pulling in the client. Message files live in `client/i18n/locales/`, one
 * per key here; adding a language means adding both.
 */
export const HUB_UI_LOCALES = {
  'en': 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'ja': '日本語',
  'ko': '한국어',
  'es': 'Español',
  'fr': 'Français',
  'de': 'Deutsch',
  'pt-BR': 'Português (Brasil)',
  'ru': 'Русский',
} as const

export type HubUiLocale = keyof typeof HUB_UI_LOCALES

export const DEFAULT_LOCALE: HubUiLocale = 'en'
