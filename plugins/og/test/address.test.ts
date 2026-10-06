import { describe, expect, it } from 'vitest'
import { formatAddress, resolveAddress } from '../app/app/utils/address'

const origin = 'http://localhost:5175'

describe('og address bar', () => {
  it('shows a page on the embedding origin as its path', () => {
    expect(formatAddress('http://localhost:5175/', origin)).toBe('/')
    expect(formatAddress('http://localhost:5175/posts?page=2#top', origin)).toBe('/posts?page=2#top')
  })

  it('keeps a URL on another origin, or with no embedding page, in full', () => {
    expect(formatAddress('https://devfra.me/guide', origin)).toBe('https://devfra.me/guide')
    expect(formatAddress('http://localhost:5175/posts', undefined)).toBe('http://localhost:5175/posts')
  })

  it('resolves a typed path against the embedding origin', () => {
    expect(resolveAddress(' /posts ', origin)).toBe('http://localhost:5175/posts')
  })

  it('sends full URLs, and paths with no embedding page, as typed', () => {
    expect(resolveAddress('https://devfra.me/', origin)).toBe('https://devfra.me/')
    expect(resolveAddress('/posts', undefined)).toBe('/posts')
  })
})
