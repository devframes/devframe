/**
 * Wire types shared by the server RPC functions and the SPA. Types only,
 * safe to import from browser code without dragging jora into the bundle.
 */

/** Client-controlled filtering, applied by the normalizer and the skeleton. */
export interface FilterOptions {
  excludeFunctions?: boolean
  excludeUnderscoreProps?: boolean
  excludeDollarProps?: boolean
}

/**
 * One structural step from a query result toward a nested node, recorded by
 * the normalizer on each depth-truncated marker so the client can lazily
 * re-fetch that subtree with a fresh depth budget (see `queryPath`). Each
 * segment mirrors exactly one descent the normalizer makes:
 *
 *   - `['k', key]`   own object property, or a string-keyed Map value
 *   - `['i', index]` array item (index into the filtered array)
 *   - `['s', index]` Set value
 *   - `['mk', index]` / `['mv', index]` non-string Map entry key / value
 */
export type PathSegment
  = | ['k', string]
    | ['i', number]
    | ['s', number]
    | ['mk', number]
    | ['mv', number]

/** A path from the query root to a nested node: a list of structural steps. */
export type NodePath = PathSegment[]

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
  /** Phosphor icon class shown in the source picker (e.g. `i-ph:database-duotone`). */
  icon?: string
  /** Data never changes; the server memoizes the resolved value. */
  static: boolean
  /** The source opted into live edits through the `write` RPC. */
  writable: boolean
  /** Suggested queries provided by the source (shown read-only). */
  queries?: Query[]
}

/**
 * A value carried inside a write request. JSON can't express `undefined`,
 * so the payload is discriminated instead of raw.
 */
export type WriteValue
  = | { kind: 'json', value: unknown }
    | { kind: 'undefined' }

/**
 * One mutation of a writable source's live object. Ops are container-generic:
 * the server resolves the path and dispatches on what it finds there
 * (object / array / Map / Set).
 *
 *   - `set`    replace the value at `path`.
 *   - `delete` remove the node at `path` from its container.
 *   - `add`    `path` addresses the CONTAINER; insert `key`/`value`
 *                (objects and Maps need `key`; arrays take an optional index
 *                `key` to splice at, else append; Sets take just `value`).
 *   - `rename` re-key the node at `path` under `key`, atomically
 *                (objects and Maps; the renamed key lands last).
 */
export type WriteRequest
  = | { op: 'set', path: NodePath, value: WriteValue }
    | { op: 'delete', path: NodePath }
    | { op: 'add', path: NodePath, key?: WriteValue, value: WriteValue }
    | { op: 'rename', path: NodePath, key: WriteValue }

export type WriteOutcome
  = | { ok: true }
    | { ok: false, error: { name: string, message: string } }

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

/**
 * Where a saved query persists, mirroring the host storage scopes:
 * `workspace` is committable and shared with the team, `project` is
 * per-checkout private (node_modules).
 */
export type SavedQueryScope = 'workspace' | 'project'

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
