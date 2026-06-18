import type { DevframeNodeRpcSession } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { InternalAnonymousAuthStorage } from '../hub-internals/context'
import { randomDigits, timingSafeEqual } from 'devframe/utils/crypto-token'

/** Number of decimal digits in a human-typed one-time pairing code. */
const TEMP_AUTH_TOKEN_LENGTH = 6
/**
 * How long a pairing code stays valid after it is (re)generated. A 6-digit
 * code only has ~20 bits of entropy, so a short lifetime plus the attempt cap
 * below are what keep it brute-force resistant.
 */
const TEMP_AUTH_TOKEN_TTL = 5 * 60_000
/** Failed attempts allowed against a single code before it is rotated. */
const TEMP_AUTH_MAX_ATTEMPTS = 5

export interface PendingAuthRequest {
  clientAuthToken: string
  session: DevframeNodeRpcSession
  ua: string
  origin: string
  resolve: (result: { isTrusted: boolean }) => void
  abortController: AbortController
  timeout: ReturnType<typeof setTimeout>
}

let pendingAuth: PendingAuthRequest | null = null
let tempAuthToken: string = generateTempId()
let tempAuthExpiresAt: number = Date.now() + TEMP_AUTH_TOKEN_TTL
let tempAuthFailedAttempts = 0

function generateTempId(): string {
  return randomDigits(TEMP_AUTH_TOKEN_LENGTH)
}

export function getTempAuthToken(): string {
  return tempAuthToken
}

/**
 * Rotate the pairing code, resetting its expiry window and failed-attempt
 * counter. Adapters call this when a new pairing flow begins so the displayed
 * code is freshly valid.
 */
export function refreshTempAuthToken(): string {
  tempAuthToken = generateTempId()
  tempAuthExpiresAt = Date.now() + TEMP_AUTH_TOKEN_TTL
  tempAuthFailedAttempts = 0
  return tempAuthToken
}

export function getPendingAuth(): PendingAuthRequest | null {
  return pendingAuth
}

export function setPendingAuth(request: PendingAuthRequest | null): void {
  pendingAuth = request
}

/**
 * Abort and clean up any existing pending auth request.
 */
export function abortPendingAuth(): void {
  if (pendingAuth) {
    pendingAuth.abortController.abort()
    clearTimeout(pendingAuth.timeout)
    pendingAuth = null
  }
}

/**
 * Consume the temp auth code: verify it matches an active, unexpired pairing
 * code, trust the pending client, and clean up. Returns the client's authToken
 * on success, `null` otherwise.
 *
 * Because the code is short and human-typed, verification is hardened against
 * brute force: it requires a live pending request, enforces a time-to-live,
 * compares in constant time, and rotates the code after
 * {@link TEMP_AUTH_MAX_ATTEMPTS} failed attempts so an attacker cannot keep
 * guessing against the same code.
 */
export function consumeTempAuthToken(
  id: string,
  storage: SharedState<InternalAnonymousAuthStorage>,
): string | null {
  if (!pendingAuth)
    return null

  // Expired code: rotate so a stale code can never be redeemed.
  if (Date.now() > tempAuthExpiresAt) {
    refreshTempAuthToken()
    return null
  }

  if (!timingSafeEqual(id, tempAuthToken)) {
    tempAuthFailedAttempts += 1
    // Too many wrong guesses — invalidate this code entirely.
    if (tempAuthFailedAttempts >= TEMP_AUTH_MAX_ATTEMPTS)
      refreshTempAuthToken()
    return null
  }

  const { clientAuthToken, session, ua, origin, resolve } = pendingAuth

  // Trust the pending client
  storage.mutate((state) => {
    state.trusted[clientAuthToken] = {
      authToken: clientAuthToken,
      ua,
      origin,
      timestamp: Date.now(),
    }
  })
  session.meta.clientAuthToken = clientAuthToken
  session.meta.isTrusted = true

  // Resolve the pending auth RPC call
  resolve({ isTrusted: true })

  // Abort terminal prompt and clean up
  abortPendingAuth()

  // Generate a new temp ID for next use
  refreshTempAuthToken()

  return clientAuthToken
}
