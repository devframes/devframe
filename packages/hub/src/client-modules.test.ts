import type { ConnectionMeta } from 'devframe/types'
import { describe, expect, it } from 'vitest'
import {
  applyClientModuleResolutionTemplate,
  clientScriptFailureHint,
  isBareModuleSpecifier,
  resolveClientModuleSpecifier,
} from './client-modules'

function metaWith(clientModuleResolution?: string): ConnectionMeta {
  return {
    backend: 'websocket',
    ...(clientModuleResolution
      ? { configs: { dock: { clientModuleResolution } } }
      : {}),
  }
}

describe('isBareModuleSpecifier', () => {
  it('recognizes npm-style names, scoped packages, and subpaths', () => {
    expect(isBareModuleSpecifier('nanoevents')).toBe(true)
    expect(isBareModuleSpecifier('@scope/pkg')).toBe(true)
    expect(isBareModuleSpecifier('vite-plugin-vue-tracer/client/vite-devtools')).toBe(true)
  })

  it('rejects everything the browser resolves natively', () => {
    expect(isBareModuleSpecifier('/@fs/abs/path.js')).toBe(false)
    expect(isBareModuleSpecifier('/@id/pkg')).toBe(false)
    expect(isBareModuleSpecifier('./relative.js')).toBe(false)
    expect(isBareModuleSpecifier('../up.js')).toBe(false)
    expect(isBareModuleSpecifier('//cdn.example.com/mod.js')).toBe(false)
    expect(isBareModuleSpecifier('https://example.com/mod.js')).toBe(false)
    expect(isBareModuleSpecifier('data:text/javascript,export default 1')).toBe(false)
    expect(isBareModuleSpecifier('blob:http://localhost/x')).toBe(false)
    expect(isBareModuleSpecifier('')).toBe(false)
    expect(isBareModuleSpecifier('   ')).toBe(false)
  })
})

describe('applyClientModuleResolutionTemplate', () => {
  it('replaces the {specifier} token', () => {
    expect(applyClientModuleResolutionTemplate('/@id/{specifier}', 'foo/bar')).toBe('/@id/foo/bar')
  })

  it('uses a token-less template as a prefix', () => {
    expect(applyClientModuleResolutionTemplate('/modules/', 'foo')).toBe('/modules/foo')
  })
})

describe('resolveClientModuleSpecifier', () => {
  it('passes URL specifiers through untouched, template or not', () => {
    expect(resolveClientModuleSpecifier('/@fs/abs/inject.js', {
      connectionMeta: metaWith('/@id/{specifier}'),
      metaBaseUrl: 'http://localhost:5173/__devframes/__connection.json',
    })).toBe('/@fs/abs/inject.js')
    expect(resolveClientModuleSpecifier('./mod.js', {})).toBe('./mod.js')
  })

  it('leaves a bare specifier unchanged when nothing resolves it', () => {
    expect(resolveClientModuleSpecifier('foo/bar', { connectionMeta: metaWith() })).toBe('foo/bar')
    expect(resolveClientModuleSpecifier('foo/bar', {})).toBe('foo/bar')
  })

  it('applies the host-advertised template, resolved against metaBaseUrl', () => {
    expect(resolveClientModuleSpecifier('vite-plugin-vue-tracer/client/vite-devtools', {
      connectionMeta: metaWith('/@id/{specifier}'),
      metaBaseUrl: 'http://localhost:5173/__devframes/__connection.json',
    })).toBe('http://localhost:5173/@id/vite-plugin-vue-tracer/client/vite-devtools')
  })

  it('returns the applied template as-is without a usable base', () => {
    expect(resolveClientModuleSpecifier('foo', {
      connectionMeta: metaWith('/@id/{specifier}'),
    })).toBe('/@id/foo')
  })

  it('prefers the explicit resolveClientModule option over the template', () => {
    expect(resolveClientModuleSpecifier('foo', {
      resolveClientModule: s => `/custom/${s}`,
      connectionMeta: metaWith('/@id/{specifier}'),
      metaBaseUrl: 'http://localhost:5173/__devframes/__connection.json',
    })).toBe('/custom/foo')
  })

  it('falls through to the template when the option returns undefined', () => {
    expect(resolveClientModuleSpecifier('foo', {
      resolveClientModule: () => undefined,
      connectionMeta: metaWith('/@id/{specifier}'),
      metaBaseUrl: 'http://localhost:5173/__devframes/__connection.json',
    })).toBe('http://localhost:5173/@id/foo')
  })

  it('never calls the option for URL specifiers', () => {
    let called = false
    expect(resolveClientModuleSpecifier('/already/a/url.js', {
      resolveClientModule: (s) => {
        called = true
        return `/custom/${s}`
      },
    })).toBe('/already/a/url.js')
    expect(called).toBe(false)
  })
})

describe('clientScriptFailureHint', () => {
  it('is silent for URL specifiers', () => {
    expect(clientScriptFailureHint('/@fs/abs/inject.js', '/@fs/abs/inject.js')).toBe('')
  })

  it('names the capability gap for an unresolved bare specifier', () => {
    const hint = clientScriptFailureHint('foo/bar', 'foo/bar')
    expect(hint).toContain('clientModuleResolution')
    expect(hint).toContain('bare npm specifier')
  })

  it('names the serving gap for a resolved-but-failed bare specifier', () => {
    const hint = clientScriptFailureHint('foo/bar', 'http://localhost:5173/@id/foo/bar')
    expect(hint).toContain('"foo/bar"')
    expect(hint).toContain('could not serve the module')
  })
})
