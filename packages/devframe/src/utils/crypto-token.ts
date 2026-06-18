// Cryptographically-secure token helpers built on the WebCrypto global
// (`globalThis.crypto`), which is present in browsers and Node 19+. Kept free
// of node builtins so it stays runtime-agnostic (see `test/runtime-agnostic.test.ts`)
// and can be shared by browser-side client code and node-side auth code alike.
//
// `getRandomValues` is available in both secure and insecure contexts, unlike
// `crypto.randomUUID`, so it works even when a devtool is reached over plain
// HTTP on a LAN address.

const HEX = '0123456789abcdef'

/**
 * Generate a high-entropy, URL-safe (hex) random token suitable for use as a
 * bearer credential — e.g. the persistent client auth token or an ephemeral
 * remote-dock token. Defaults to 16 bytes (128 bits) of entropy.
 */
export function randomToken(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength)
  globalThis.crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i++)
    out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 0x0F]
  return out
}

/**
 * Generate a uniformly-distributed string of decimal digits using rejection
 * sampling to avoid modulo bias. Intended for short, human-typed one-time
 * codes (e.g. a 6-digit pairing code). Leading zeros are preserved.
 */
export function randomDigits(length: number): string {
  // Largest multiple of 10 that fits in a byte; reject values at/above it so
  // every digit is equally likely.
  const limit = 250
  const buf = new Uint8Array(1)
  let out = ''
  while (out.length < length) {
    globalThis.crypto.getRandomValues(buf)
    if (buf[0] < limit)
      out += String(buf[0] % 10)
  }
  return out
}

/**
 * Constant-time string equality. Compares every character so the comparison
 * time does not depend on the position of the first mismatch, mitigating
 * timing side-channels when verifying secrets.
 *
 * Length is treated as public (it short-circuits on differing lengths), which
 * is appropriate for fixed-length codes and tokens.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length)
    return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++)
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}
