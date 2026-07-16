/**
 * PROTOTYPE — throwaway code.
 *
 * Wire types shared by the server RPC functions and the SPA. Types only —
 * safe to import from browser code without dragging jora into the bundle.
 */

/** One completion candidate: replace [from, to) with `value`. */
export interface SuggestItem {
  type: string
  from: number
  to: number
  /** The fragment currently typed in that range. */
  current: string
  /** The completion to insert. */
  value: string
}

export interface SuggestOutcome {
  ok: boolean
  suggestions: SuggestItem[]
  statMs: number
  error?: string
}
