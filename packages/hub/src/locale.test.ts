import { describe, expect, it } from 'vitest'
import { matchLocale, resolveTitle } from './locale'

describe('matchLocale', () => {
  const available = ['en', 'zh-CN', 'zh-TW', 'pt-BR']

  it.each([
    ['en-US', 'en'],
    ['ZH-cn', 'zh-CN'],
    ['zh', 'zh-CN'],
    ['zh-Hant', 'zh-TW'],
    ['zh-HK', 'zh-TW'],
    ['pt-PT', 'pt-BR'],
    ['it', undefined],
    [undefined, undefined],
  ])('narrows %s to %s', (tag, expected) => {
    expect(matchLocale(tag, available)).toBe(expected)
  })
})

describe('resolveTitle', () => {
  const entry = { title: 'Build', titleLocales: { 'zh-CN': '构建', 'ja': 'ビルド' } }

  it('picks the closest translation', () => {
    expect(resolveTitle(entry, 'zh-Hans-CN')).toBe('构建')
    expect(resolveTitle(entry, 'ja-JP')).toBe('ビルド')
  })

  it('falls back to the default title', () => {
    expect(resolveTitle(entry, 'fr')).toBe('Build')
    expect(resolveTitle({ title: 'Build' }, 'ja')).toBe('Build')
  })
})
