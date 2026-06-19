import type { DevframeRpcClient } from './rpc'
import { DEVFRAME_OTP_URL_PARAM } from 'devframe/constants'

// Browser-only helpers for "magic link" authentication: a host prints a URL
// carrying a one-time authentication code (OTP), and the client reads it,
// exchanges it for a token, and removes it from the address bar. Only the
// short-lived, single-use OTP ever rides the URL — never the resulting token.

/**
 * Read a one-time authentication code (OTP) from the current page URL's query
 * string, without side effects. Returns `undefined` when the parameter is absent.
 */
export function readOtpFromUrl(param: string = DEVFRAME_OTP_URL_PARAM): string | undefined {
  try {
    return new URLSearchParams(globalThis.location?.search).get(param) || undefined
  }
  catch {
    return undefined
  }
}

function stripParamFromUrl(param: string): void {
  try {
    const url = new URL(globalThis.location!.href)
    if (!url.searchParams.has(param))
      return
    url.searchParams.delete(param)
    globalThis.history?.replaceState(globalThis.history.state, '', url.href)
  }
  catch {}
}

/**
 * Read the one-time code from the page URL and remove it from the address bar
 * (and the current history entry), so the single-use code isn't left in the
 * URL, browser history, or a `Referer`. Returns the code, or `undefined` when
 * absent.
 */
export function consumeOtpFromUrl(param: string = DEVFRAME_OTP_URL_PARAM): string | undefined {
  const code = readOtpFromUrl(param)
  if (code)
    stripParamFromUrl(param)
  return code
}

/**
 * Consume a one-time code from the page URL (see {@link consumeOtpFromUrl}) and
 * exchange it for a token via the client. Resolves `true` when the client is
 * authenticated (already trusted, or the exchange succeeded), and `false` when
 * no code is present or the exchange failed.
 *
 * Higher-level integrations (e.g. Vite DevTools) that want to drive their own
 * authentication UI can disable `connectDevframe`'s built-in handling with
 * `otpParam: false` and call this — or {@link consumeOtpFromUrl} — themselves.
 */
export async function authenticateWithUrlOtp(
  rpc: Pick<DevframeRpcClient, 'isTrusted' | 'requestTrustWithCode'>,
  options: { param?: string } = {},
): Promise<boolean> {
  const code = consumeOtpFromUrl(options.param ?? DEVFRAME_OTP_URL_PARAM)
  if (!code)
    return false
  if (rpc.isTrusted)
    return true
  return rpc.requestTrustWithCode(code)
}
