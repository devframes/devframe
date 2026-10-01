import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { HUB_UI_LOCALES, matchLocale } from '../../locales'
import { loadLocale, locale, setHostLocale, setLocalePreference, t, tAround } from './index'
import en from './locales/en.json'

const files = import.meta.glob<Record<string, string>>('./locales/*.json', { import: 'default' })
const keys = Object.keys(en)

beforeAll(() => Promise.all(Object.keys(HUB_UI_LOCALES).map(code => loadLocale(code as keyof typeof HUB_UI_LOCALES))))
const slots = (message: string) => [...message.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()

afterEach(() => {
  setLocalePreference('auto')
  setHostLocale(undefined)
})

describe('locale files', () => {
  it.each(Object.keys(HUB_UI_LOCALES))('%s translates every key and keeps the slots', async (code) => {
    const file = await files[`./locales/${code}.json`]!()
    expect(Object.keys(file).sort()).toEqual([...keys].sort())
    for (const key of keys) {
      const source = en[key as keyof typeof en]!
      expect(slots(file[key as keyof typeof file]!), key).toEqual(slots(source))
    }
  })
})

describe('matchLocale', () => {
  it.each([
    ['en-US', 'en'],
    ['zh', 'zh-CN'],
    ['zh-Hant', 'zh-TW'],
    ['zh-HK', 'zh-TW'],
    ['pt', 'pt-BR'],
    ['pt-PT', 'pt-BR'],
    ['it', undefined],
  ])('narrows %s to %s', (tag, expected) => {
    expect(matchLocale(tag)).toBe(expected)
  })
})

describe('locale resolution', () => {
  it('follows the host default while the preference is auto', () => {
    setHostLocale('ja')
    expect(locale.value).toBe('ja')
    expect(t('dock.settings')).toBe('設定')
  })

  it('prefers the visitor pick over the host default', () => {
    setHostLocale('ja')
    setLocalePreference('de')
    expect(locale.value).toBe('de')
  })

  it('falls back to English when nothing matches', () => {
    setHostLocale('it')
    expect(locale.value).toBe('en')
  })
})

describe('t', () => {
  it('fills slots and leaves unknown ones in place', () => {
    expect(t('command.hide', { productName: 'Hub' })).toBe('Hide Hub')
    expect(t('auth.otpDigit', { index: 2 })).toBe('Digit 2 of {length}')
  })

  it('splits a message around one slot in the locale word order', () => {
    setLocalePreference('ja')
    expect(tAround('auth.findCode', 'code')).toEqual(['ターミナルに表示された', 'を確認してください。'])
  })
})
