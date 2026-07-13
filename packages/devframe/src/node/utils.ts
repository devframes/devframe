import { isIP } from 'node:net'

export function isObject(value: unknown): value is Record<string, any> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

// Wildcard bind addresses (`0.0.0.0` / `::`) mean "listen on every interface";
// they are not themselves dialable from a browser. When advertising a URL for a
// client to open (banner, browser-open, dock entries), fall back to loopback —
// the same thing Vite and friends do when bound to `--host 0.0.0.0`.
const NON_DIALABLE_HOSTS = new Set([
  '0.0.0.0',
  '127.0.0.1',
  '::',
  '0000:0000:0000:0000:0000:0000:0000:0000',
  '', // an empty host binds to all interfaces too
])

/** Map a bind host to a host a client can actually connect to. */
export function toDialableHost(host: string): string {
  return NON_DIALABLE_HOSTS.has(host) ? 'localhost' : host
}

/** Format a bind host for use in a URL authority (dialable, IPv6-bracketed). */
export function formatHostForUrl(host: string): string {
  const dialable = toDialableHost(host)
  return isIP(dialable) === 6 ? `[${dialable}]` : dialable
}

export function normalizeHttpServerUrl(host: string, port: number | string): string {
  return `http://${formatHostForUrl(host)}:${port}`
}
