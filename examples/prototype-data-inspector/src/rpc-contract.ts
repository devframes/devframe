/**
 * PROTOTYPE — throwaway code.
 *
 * Wire types shared by the server RPC functions and the SPA. Types only —
 * safe to import from browser code without dragging jora into the bundle.
 */

/** Client-controlled filtering, applied by the normalizer and the skeleton. */
export interface FilterOptions {
  excludeFunctions?: boolean
  excludeUnderscoreProps?: boolean
  excludeDollarProps?: boolean
}

/** A query recipe: the text plus the filter options it was authored with. */
export interface Query extends FilterOptions {
  query: string
  title?: string
  description?: string
}

/** What the client sees of a registered data source. */
export interface DataSourceMeta {
  id: string
  title: string
  description?: string
  /** Data never changes; the server memoizes `getData()`. */
  static: boolean
  /** Suggested queries provided by the source (shown read-only). */
  queries?: Query[]
}

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

export interface NormalizeStatsWire {
  nodes: number
  refs: number
  truncatedDepth: number
  truncatedEntries: number
  truncatedProps: number
  ms: number
}

export interface QueryStats {
  queryMs: number
  normalize: NormalizeStatsWire
  payloadBytes: number
}

export type QueryOutcome
  = | { ok: true, result: unknown, stats: QueryStats }
    | { ok: false, error: { name: string, message: string } }

export type SkeletonOutcome
  = | { ok: true, skeleton: unknown, nodes: number, ms: number }
    | { ok: false, error: { name: string, message: string } }

/** Where a saved query persists. */
export type SavedQueryScope = 'user' | 'project'

export interface SavedQuery extends Query {
  /** Storage key. Derived from the title (or query) when not supplied. */
  id: string
  scope: SavedQueryScope
  updatedAt: number
}

export interface SaveQueryInput extends Query {
  id?: string
  scope: SavedQueryScope
}
