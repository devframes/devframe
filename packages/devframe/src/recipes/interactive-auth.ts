import type { DevframeNodeContext, DevframeNodeRpcSession } from 'devframe/types'
import type { DevframeAuthHandler } from '../node/auth'
import { colors } from 'devframe/utils/colors'
import * as v from 'valibot'
import { DEVFRAME_AUTH_TOKEN_QUERY_PARAM, isAnonymousRpcMethod } from '../constants'
import { buildOtpAuthUrl, exchangeTempAuthCode, getTempAuthCode, verifyAuthToken } from '../node/auth/state'
import { getInternalContext } from '../node/hub-internals/context'
import { defineRpcFunction } from '../rpc/define'

export interface CreateInteractiveAuthOptions {
  /**
   * Static, pre-shared bearer tokens that are always trusted — for CI runs
   * or shared machines where the interactive code prompt would only get in
   * the way. Checked in both the handshake handler and the connect-time
   * hook, alongside tokens minted by a real code exchange.
   */
  clientAuthTokens?: string[]
  /**
   * Print the current code + magic-link URL. Devframe stays headless, so
   * there is no default banner printed automatically — call
   * `auth.printBanner()` yourself once the server is listening. Override
   * this to customize the format; defaults to a small boxed message on
   * stdout.
   */
  banner?: (info: { code: string, url: string }) => void
  /**
   * The base URL the magic link should point at. Defaults to
   * `context.host.resolveOrigin()`.
   */
  serverUrl?: () => string
}

function defaultBanner(info: { code: string, url: string }): void {
  // eslint-disable-next-line no-console
  console.log(`\n  ${colors.dim('devframe auth code')}  ${colors.bold(info.code)}\n  ${colors.dim('or open')}       ${colors.cyan(info.url)}\n`)
}

/**
 * Package the interactive OTP auth protocol devframe's primitives
 * (`exchangeTempAuthCode`, `verifyAuthToken`, `revokeAuthToken`,
 * `getTempAuthCode`, `buildOtpAuthUrl`) implement into a ready-made
 * {@link DevframeAuthHandler} — the handshake RPC functions, the resolver
 * gate, the connect-time trust hook, and the startup banner.
 *
 * The auth storage stays internal to this handler — callers never reach into
 * `devframe/node/hub-internals` themselves.
 *
 * ```ts
 * import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'
 *
 * const auth = createInteractiveAuth(ctx)
 * auth.rpcFunctions.forEach(fn => ctx.rpc.register(fn))
 * auth.printBanner()
 *
 * // wire `auth.authorize` / `auth.onConnect` into your transport, or pass
 * // the whole handler to `startHttpAndWs({ auth, ... })`.
 * ```
 */
export function createInteractiveAuth(
  context: DevframeNodeContext,
  options: CreateInteractiveAuthOptions = {},
): DevframeAuthHandler {
  const internal = getInternalContext(context)
  const storage = internal.storage.auth
  const staticTokens = new Set(options.clientAuthTokens ?? [])

  function isStaticToken(token: string | undefined): boolean {
    return !!token && staticTokens.has(token)
  }

  function resolveServerUrl(): string {
    return options.serverUrl?.() ?? context.host.resolveOrigin()
  }

  let bannerPrintedForCode: string | undefined
  function printBanner(): void {
    const code = getTempAuthCode()
    if (code === bannerPrintedForCode)
      return
    bannerPrintedForCode = code
    const url = buildOtpAuthUrl(resolveServerUrl(), code)
    ;(options.banner ?? defaultBanner)({ code, url })
  }

  const anonymousAuth = defineRpcFunction({
    name: 'anonymous:devframe:auth',
    type: 'action',
    jsonSerializable: true,
    args: [v.object({
      authToken: v.string(),
      ua: v.string(),
      origin: v.string(),
    })],
    returns: v.object({ isTrusted: v.boolean() }),
    handler(params) {
      const session = context.rpc.getCurrentRpcSession()
      if (!session)
        return { isTrusted: false }
      if (session.meta.isTrusted)
        return { isTrusted: true }
      if (isStaticToken(params.authToken)) {
        session.meta.clientAuthToken = params.authToken
        session.meta.isTrusted = true
        return { isTrusted: true }
      }
      return { isTrusted: verifyAuthToken(params.authToken, session, storage) }
    },
  })

  const anonymousAuthExchange = defineRpcFunction({
    name: 'anonymous:devframe:auth:exchange',
    type: 'action',
    jsonSerializable: true,
    args: [v.object({
      code: v.string(),
      ua: v.string(),
      origin: v.string(),
    })],
    returns: v.object({ authToken: v.nullable(v.string()) }),
    handler(params) {
      const session = context.rpc.getCurrentRpcSession()
      if (!session)
        return { authToken: null }
      const authToken = exchangeTempAuthCode(params.code, session, params, storage)
      // The code was just consumed (success or a rotating failure) — the
      // next `printBanner()` call shows whatever code is current now.
      printBanner()
      return { authToken }
    },
  })

  const revoke = defineRpcFunction({
    name: 'devframe:auth:revoke',
    type: 'action',
    jsonSerializable: true,
    args: [],
    returns: v.void(),
    async handler() {
      const session = context.rpc.getCurrentRpcSession()
      const token = session?.meta.clientAuthToken
      if (token)
        await internal.revokeAuthToken(token)
    },
  })

  function authorize(methodName: string, session: DevframeNodeRpcSession): boolean {
    if (isAnonymousRpcMethod(methodName))
      return true
    return !!session.meta.isTrusted
  }

  function onConnect(peer: { request?: { url: string } }, session: DevframeNodeRpcSession): void {
    let token: string | undefined
    try {
      const url = new URL(peer.request?.url ?? '', 'http://localhost')
      token = url.searchParams.get(DEVFRAME_AUTH_TOKEN_QUERY_PARAM) ?? undefined
    }
    catch {}
    if (!token)
      return
    if (isStaticToken(token)) {
      session.meta.clientAuthToken = token
      session.meta.isTrusted = true
      return
    }
    verifyAuthToken(token, session, storage)
  }

  return {
    rpcFunctions: [anonymousAuth, anonymousAuthExchange, revoke],
    authorize,
    onConnect: onConnect as DevframeAuthHandler['onConnect'],
    printBanner,
  }
}
