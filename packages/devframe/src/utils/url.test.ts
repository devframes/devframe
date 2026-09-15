import { describe, expect, it } from 'vitest'
import {
  cleanDoubleSlashes,
  joinURL,
  withBase,
  withLeadingSlash,
  withoutLeadingSlash,
  withoutTrailingSlash,
  withProtocol,
  withTrailingSlash,
} from './url'

describe('utils/url', () => {
  it('adds and removes leading slashes', () => {
    expect(withLeadingSlash('base')).toBe('/base')
    expect(withLeadingSlash('/base')).toBe('/base')
    expect(withLeadingSlash('')).toBe('/')
    expect(withoutLeadingSlash('/base')).toBe('base')
    expect(withoutLeadingSlash('base')).toBe('base')
    expect(withoutLeadingSlash('/')).toBe('/')
  })

  it('adds and removes trailing slashes', () => {
    expect(withTrailingSlash('base')).toBe('base/')
    expect(withTrailingSlash('base/')).toBe('base/')
    expect(withoutTrailingSlash('base/')).toBe('base')
    expect(withoutTrailingSlash('base')).toBe('base')
    expect(withoutTrailingSlash('/')).toBe('/')
  })

  it('cleans double slashes but keeps the protocol seam', () => {
    expect(cleanDoubleSlashes('//base//sub//')).toBe('/base/sub/')
    expect(cleanDoubleSlashes('http://example.com//base//')).toBe('http://example.com/base/')
    expect(cleanDoubleSlashes('/base/')).toBe('/base/')
  })

  it('joins segments with single slashes', () => {
    expect(joinURL('/', '__mcp')).toBe('/__mcp')
    expect(joinURL('/base', 'route')).toBe('/base/route')
    expect(joinURL('/base/', '/route')).toBe('/base/route')
    expect(joinURL('/base', './route')).toBe('/base/route')
    expect(joinURL('/base', '__renderers', 'vue.mjs')).toBe('/base/__renderers/vue.mjs')
    expect(joinURL('', 'route')).toBe('route')
    expect(joinURL('/base', '')).toBe('/base')
    expect(joinURL('/base', '/')).toBe('/base')
    expect(joinURL('http://localhost:3000', '/__devframe/')).toBe('http://localhost:3000/__devframe/')
  })

  it('prefixes with a base', () => {
    expect(withBase('meta.json', '/__devframe/')).toBe('/__devframe/meta.json')
    expect(withBase('/__devframe/meta.json', '/__devframe/')).toBe('/__devframe/meta.json')
    expect(withBase('meta.json', '/')).toBe('meta.json')
    expect(withBase('meta.json', '')).toBe('meta.json')
    expect(withBase('http://example.com/x', '/base')).toBe('http://example.com/x')
    expect(withBase('/__devframe/', 'http://localhost:5173')).toBe('http://localhost:5173/__devframe/')
  })

  it('swaps protocols', () => {
    expect(withProtocol('http://localhost:3000/ws', 'ws://')).toBe('ws://localhost:3000/ws')
    expect(withProtocol('https://example.com/ws', 'wss://')).toBe('wss://example.com/ws')
    expect(withProtocol('localhost:3000/ws', 'ws://')).toBe('ws://localhost:3000/ws')
  })
})
