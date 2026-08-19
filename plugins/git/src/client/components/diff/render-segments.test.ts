import type { Token } from './use-diff-tokens'
import { describe, expect, it } from 'vitest'
import { buildSegments } from './render-segments'

describe('buildSegments', () => {
  it('splits plain content around a changed word range', () => {
    const segments = buildSegments(null, 'abc', [[1, 2]])
    expect(segments).toEqual([
      { text: 'a', style: undefined, changed: false },
      { text: 'b', style: undefined, changed: true },
      { text: 'c', style: undefined, changed: false },
    ])
  })

  it('keeps token styles while marking changed segments', () => {
    const tokens = [
      { content: 'foo', offset: 0, htmlStyle: { 'color': '#111', '--shiki-dark': '#eee' } },
      { content: 'bar', offset: 3, htmlStyle: { 'color': '#222', '--shiki-dark': '#ddd' } },
    ] as unknown as Token[]
    const segments = buildSegments(tokens, 'foobar', [[3, 6]])
    expect(segments).toEqual([
      { text: 'foo', style: { 'color': '#111', '--shiki-dark': '#eee' }, changed: false },
      { text: 'bar', style: { 'color': '#222', '--shiki-dark': '#ddd' }, changed: true },
    ])
  })

  it('falls back to one plain span when tokens do not cover the content', () => {
    const tokens = [{ content: 'xy', offset: 0, htmlStyle: { color: '#111' } }] as unknown as Token[]
    const segments = buildSegments(tokens, 'mismatched', [])
    expect(segments).toEqual([{ text: 'mismatched', style: undefined, changed: false }])
  })

  it('renders an empty line as a single empty segment', () => {
    expect(buildSegments(null, '', [])).toEqual([{ text: '', style: undefined, changed: false }])
  })
})
