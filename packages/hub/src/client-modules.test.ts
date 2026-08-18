import { describe, expect, it } from 'vitest'
import {
  clientScriptFailureHint,
  isBareModuleSpecifier,
  resolveClientModuleSpecifier,
} from './client-modules'

describe('isBareModuleSpecifier', () => {
  it('recognizes npm-style names, scoped packages, and subpaths', () => {
    expect(isBareModuleSpecifier('nanoevents')).toBe(true)
    expect(isBareModuleSpecifier('@scope/pkg')).toBe(true)
    expect(isBareModuleSpecifier('vite-plugin-vue-tracer/client/vite-devtools')).toBe(true)
  })

  it('rejects everything the browser resolves natively', () => {
    for (const url of [
      '/@fs/abs/path.js',
      '/@id/pkg',
      './relative.js',
      '../up.js',
      '//cdn.example.com/mod.js',
      'https://example.com/mod.js',
      'data:text/javascript,export default 1',
      'blob:http://localhost/x',
      '',
      '   ',
    ]) {
      expect(isBareModuleSpecifier(url), url).toBe(false)
    }
  })
})

describe('resolveClientModuleSpecifier', () => {
  const metaBaseUrl = 'http://localhost:5173/__devframes/__connection.json'

  it('passes URL specifiers through untouched, template or not', () => {
    expect(resolveClientModuleSpecifier('/@fs/abs/inject.js', { template: '/@id/{specifier}', metaBaseUrl }))
      .toBe('/@fs/abs/inject.js')
    expect(resolveClientModuleSpecifier('./mod.js')).toBe('./mod.js')
  })

  it('leaves a bare specifier unchanged when nothing resolves it', () => {
    expect(resolveClientModuleSpecifier('foo/bar')).toBe('foo/bar')
  })

  it('applies the host-advertised template, resolved against metaBaseUrl', () => {
    expect(resolveClientModuleSpecifier('vite-plugin-vue-tracer/client/vite-devtools', { template: '/@id/{specifier}', metaBaseUrl }))
      .toBe('http://localhost:5173/@id/vite-plugin-vue-tracer/client/vite-devtools')
  })

  it('uses a token-less template as a prefix, verbatim without a usable base', () => {
    expect(resolveClientModuleSpecifier('foo', { template: '/modules/' })).toBe('/modules/foo')
  })

  it('prefers resolveClientModule over the template, falling through on undefined', () => {
    const options = { template: '/@id/{specifier}', metaBaseUrl }
    expect(resolveClientModuleSpecifier('foo', { ...options, resolveClientModule: s => `/custom/${s}` }))
      .toBe('/custom/foo')
    expect(resolveClientModuleSpecifier('foo', { ...options, resolveClientModule: () => undefined }))
      .toBe('http://localhost:5173/@id/foo')
    // URL specifiers never reach the callback.
    expect(resolveClientModuleSpecifier('/a/url.js', { resolveClientModule: () => '/custom' }))
      .toBe('/a/url.js')
  })
})

describe('clientScriptFailureHint', () => {
  it('is silent for URL specifiers', () => {
    expect(clientScriptFailureHint('/@fs/abs/inject.js', '/@fs/abs/inject.js')).toBe('')
  })

  it('names the capability gap for an unresolved bare specifier', () => {
    expect(clientScriptFailureHint('foo/bar', 'foo/bar')).toContain('clientModuleResolution')
  })

  it('names the serving gap for a resolved-but-failed bare specifier', () => {
    expect(clientScriptFailureHint('foo/bar', 'http://localhost:5173/@id/foo/bar'))
      .toContain('could not serve the module')
  })
})
