'use client'

// Types-only: loads the service's RPC/scope augmentations so the scoped
// `call('code-to-tokens', …)` below is fully typed.
import type { ShikiTokens } from '@devframes/service-shiki'
import { useEffect, useState } from 'react'
import { useRpc } from '../rpc-provider'

const SHIKI_SERVICE = '@devframes/service-shiki'

/** The diff's Shiki theme pair, kept explicit so colors stay stable per host config. */
const DIFF_THEMES = { light: 'vitesse-light', dark: 'vitesse-dark' }

/** One reconstructed side's tokens: an array of lines, each an array of tokens. */
export type TokenLines = ShikiTokens['tokens']
export type Token = TokenLines[number][number]

export interface DiffTokensState {
  oldTokens: TokenLines | null
  newTokens: TokenLines | null
  /** True while the highlight round-trip is in flight (drives the skeleton). */
  loading: boolean
  /** True when the shiki service isn't advertised — render plain, no skeleton. */
  unavailable: boolean
}

/**
 * Highlight a file's reconstructed old/new sides through the
 * `@devframes/service-shiki` `codeToTokens` RPC (dual-theme tokens, one call
 * per non-empty side). Resolves `unavailable` when the host doesn't advertise
 * the service, so the caller can fall back to a plain, un-highlighted diff. Only
 * runs when `enabled` (so a collapsed section does no network work).
 */
export function useDiffTokens(oldText: string, newText: string, lang: string | undefined, enabled: boolean): DiffTokensState {
  const { rpc } = useRpc()
  const [state, setState] = useState<DiffTokensState>({ oldTokens: null, newTokens: null, loading: true, unavailable: false })

  useEffect(() => {
    if (!enabled)
      return
    if (!rpc) {
      setState({ oldTokens: null, newTokens: null, loading: true, unavailable: false })
      return
    }
    const shiki = rpc.services.get(SHIKI_SERVICE)
    if (!shiki) {
      setState({ oldTokens: null, newTokens: null, loading: false, unavailable: true })
      return
    }

    let cancelled = false
    setState({ oldTokens: null, newTokens: null, loading: true, unavailable: false })
    const fetchSide = (code: string): Promise<TokenLines> =>
      code === ''
        ? Promise.resolve([])
        : shiki.rpc.call('code-to-tokens', { code, lang, themes: DIFF_THEMES }).then(result => result.tokens)

    Promise.all([fetchSide(oldText), fetchSide(newText)]).then(
      ([oldTokens, newTokens]) => {
        if (!cancelled)
          setState({ oldTokens, newTokens, loading: false, unavailable: false })
      },
      () => {
        if (!cancelled)
          setState({ oldTokens: null, newTokens: null, loading: false, unavailable: true })
      },
    )
    return () => {
      cancelled = true
    }
  }, [rpc, oldText, newText, lang, enabled])

  return state
}
