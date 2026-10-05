import type { DevframeTitled } from './types/locale'

/**
 * Pick the tag in `available` closest to `tag`: exact match first, then
 * the Traditional Chinese family (`zh-Hant`, `zh-HK`, `zh-MO` → `zh-TW`),
 * then the first tag sharing the language (`pt-PT` → `pt-BR`, `en-GB` → `en`).
 */
export function matchLocale(tag: string | undefined, available: Iterable<string>): string | undefined {
  if (!tag)
    return undefined
  const tags = [...available]
  const wanted = tag.toLowerCase()
  const exact = tags.find(code => code.toLowerCase() === wanted)
  if (exact)
    return exact
  const [language, ...rest] = wanted.split('-')
  if (language === 'zh' && rest.some(part => part === 'hant' || part === 'hk' || part === 'mo' || part === 'tw')) {
    const traditional = tags.find(code => code.toLowerCase() === 'zh-tw')
    if (traditional)
      return traditional
  }
  return tags.find(code => code.toLowerCase().split('-')[0] === language)
}

/** The `title` of a dock entry, command or launcher in `locale`, else its default `title`. */
export function resolveTitle(titled: DevframeTitled, locale: string | undefined): string {
  const locales = titled.titleLocales
  if (!locales)
    return titled.title
  const matched = matchLocale(locale, Object.keys(locales))
  return matched ? locales[matched]! : titled.title
}
