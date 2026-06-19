import type { DevframeNodeRpcSession } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { InternalAnonymousAuthStorage } from '../hub-internals/context'
import { DEVFRAME_OTP_URL_PARAM } from 'devframe/constants'
import { randomDigits, randomToken, timingSafeEqual } from 'devframe/utils/crypto-token'

/** Number of decimal digits in a human-typed one-time authentication code. */
const TEMP_AUTH_CODE_LENGTH = 6
/**
 * How long an authentication code stays valid after it is (re)generated. A
 * 6-digit code only has ~20 bits of entropy, so a short lifetime plus the
 * attempt cap below are what keep it brute-force resistant.
 */
const TEMP_AUTH_CODE_TTL = 5 * 60_000
/** Failed attempts allowed against a single code before it is rotated. */
const TEMP_AUTH_MAX_ATTEMPTS = 5

let tempAuthCode: string = generateTempCode()
let tempAuthCodeExpiresAt: number = Date.now() + TEMP_AUTH_CODE_TTL
let tempAuthFailedAttempts = 0

function generateTempCode(): string {
  return randomDigits(TEMP_AUTH_CODE_LENGTH)
}

/**
 * The current one-time authentication code. Display this to the user (e.g. in
 * the dev-server terminal) so they can type it into the browser to authenticate.
 */
export function getTempAuthCode(): string {
  return tempAuthCode
}

/**
 * Rotate the authentication code, resetting its expiry window and failed-attempt
 * counter. Call this when a new authentication flow begins (e.g. when an
 * untrusted client starts authenticating) so the displayed code is freshly
 * valid for its full TTL.
 */
export function refreshTempAuthCode(): string {
  tempAuthCode = generateTempCode()
  tempAuthCodeExpiresAt = Date.now() + TEMP_AUTH_CODE_TTL
  tempAuthFailedAttempts = 0
  return tempAuthCode
}

/**
 * Build a "magic link" authentication URL that embeds a one-time code (OTP) as
 * a query parameter. Opening it authenticates the client without typing — print
 * it on startup (devframe stays headless, so the host prints its own banner).
 * Defaults to the current code; the link is subject to the same TTL.
 */
export function buildOtpAuthUrl(baseUrl: string, code: string = tempAuthCode): string {
  const url = new URL(baseUrl)
  url.searchParams.set(DEVFRAME_OTP_URL_PARAM, code)
  return url.href
}

/**
 * Re-authenticate a connection that presents a previously-issued bearer token.
 * Returns `true` and marks the session trusted when the token is known.
 *
 * Used by the `devframe:anonymous:auth` handler so a client that already
 * authenticated (token persisted in the browser) is trusted on reconnect
 * without entering the code again.
 */
export function verifyAuthToken(
  token: string,
  session: DevframeNodeRpcSession,
  storage: SharedState<InternalAnonymousAuthStorage>,
): boolean {
  if (!token || !storage.value().trusted[token])
    return false

  session.meta.clientAuthToken = token
  session.meta.isTrusted = true
  return true
}

/**
 * Exchange a one-time authentication code for a fresh, node-issued bearer token.
 *
 * On success this mints a high-entropy token, records it in the trusted store,
 * marks the calling session trusted, rotates the code, and returns the token
 * for the client to persist. Returns `null` on any failure.
 *
 * Because the code is short and human-typed, verification is hardened against
 * brute force: it enforces a time-to-live, compares in constant time, and
 * rotates the code after {@link TEMP_AUTH_MAX_ATTEMPTS} failed attempts so an
 * attacker cannot keep guessing against the same code.
 */
export function exchangeTempAuthCode(
  code: string,
  session: DevframeNodeRpcSession,
  info: { ua: string, origin: string },
  storage: SharedState<InternalAnonymousAuthStorage>,
): string | null {
  // Expired code: rotate so a stale code can never be redeemed.
  if (Date.now() > tempAuthCodeExpiresAt) {
    refreshTempAuthCode()
    return null
  }

  if (!timingSafeEqual(code, tempAuthCode)) {
    tempAuthFailedAttempts += 1
    // Too many wrong guesses — invalidate this code entirely.
    if (tempAuthFailedAttempts >= TEMP_AUTH_MAX_ATTEMPTS)
      refreshTempAuthCode()
    return null
  }

  // Code is valid — mint a fresh, node-issued bearer token for this client.
  const authToken = randomToken()
  storage.mutate((state) => {
    state.trusted[authToken] = {
      authToken,
      ua: info.ua,
      origin: info.origin,
      timestamp: Date.now(),
    }
  })
  session.meta.clientAuthToken = authToken
  session.meta.isTrusted = true

  // Rotate the code so it can never be replayed.
  refreshTempAuthCode()

  return authToken
}
