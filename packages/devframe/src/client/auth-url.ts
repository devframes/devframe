// Browser-only helpers for "magic link" pairing: a host can print a URL that
// carries a one-time pairing code, and the client reads the code, exchanges it
// for a token, and removes it from the address bar. Only the short-lived,
// single-use code ever rides the URL — never the resulting bearer token.

/**
 * Read a one-time pairing code from the current page URL's query string.
 * Returns `undefined` when the parameter is absent or unavailable.
 */
export function readAuthCodeFromUrl(param: string): string | undefined {
  try {
    return new URLSearchParams(globalThis.location?.search).get(param) || undefined
  }
  catch {
    return undefined
  }
}

/**
 * Remove the pairing-code parameter from the address bar (and the current
 * history entry) so the single-use code isn't left in the URL, browser
 * history, or a `Referer` header.
 */
export function clearAuthCodeFromUrl(param: string): void {
  try {
    const url = new URL(globalThis.location!.href)
    if (!url.searchParams.has(param))
      return
    url.searchParams.delete(param)
    globalThis.history?.replaceState(globalThis.history.state, '', url.href)
  }
  catch {}
}
