import { describe, expect, it } from 'vitest'
import { formatHostForUrl, normalizeHttpServerUrl, toDialableHost } from '../utils'

describe('normalizeHttpServerUrl', () => {
  it('formats ipv4 localhost as localhost', () => {
    expect(normalizeHttpServerUrl('127.0.0.1', 9999)).toBe('http://localhost:9999')
  })

  it('wraps ipv6 hosts in brackets', () => {
    expect(normalizeHttpServerUrl('::1', 9999)).toBe('http://[::1]:9999')
  })

  it('preserves non-ip hosts', () => {
    expect(normalizeHttpServerUrl('localhost', 9999)).toBe('http://localhost:9999')
  })

  it('maps the ipv4 wildcard bind host to a dialable loopback host', () => {
    expect(normalizeHttpServerUrl('0.0.0.0', 9710)).toBe('http://localhost:9710')
  })

  it('maps the ipv6 wildcard bind host to a dialable loopback host', () => {
    expect(normalizeHttpServerUrl('::', 9710)).toBe('http://localhost:9710')
  })
})

describe('toDialableHost', () => {
  it('rewrites wildcard and loopback bind hosts to localhost', () => {
    expect(toDialableHost('0.0.0.0')).toBe('localhost')
    expect(toDialableHost('::')).toBe('localhost')
    expect(toDialableHost('127.0.0.1')).toBe('localhost')
    expect(toDialableHost('')).toBe('localhost')
  })

  it('preserves routable hosts', () => {
    expect(toDialableHost('example.com')).toBe('example.com')
    expect(toDialableHost('192.168.1.10')).toBe('192.168.1.10')
    expect(toDialableHost('::1')).toBe('::1')
  })
})

describe('formatHostForUrl', () => {
  it('brackets ipv6 but leaves ipv4 / hostnames bare', () => {
    expect(formatHostForUrl('::1')).toBe('[::1]')
    expect(formatHostForUrl('example.com')).toBe('example.com')
    expect(formatHostForUrl('0.0.0.0')).toBe('localhost')
  })
})
