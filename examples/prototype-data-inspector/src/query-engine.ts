/**
 * PROTOTYPE — throwaway code.
 *
 * Server-side jora execution against LIVE objects, plus stat-mode
 * suggestions. Custom methods bridge jora's blind spots on live graphs
 * (Map/Set are opaque to it; the prototype chain is not walked).
 */
import type { NormalizeOptions } from './normalize'
import type { QueryOutcome, SuggestItem, SuggestOutcome } from './rpc-contract'
import jora from 'jora'
import { normalize } from './normalize'

export type { SuggestItem, SuggestOutcome } from './rpc-contract'

/**
 * Duck-typed Map detection: Vite 8's backward-compat `moduleGraph.idToModuleMap`
 * is a Map-like facade (plain object with get/entries/size), not a real Map.
 */
function isMapLike(v: unknown): v is Map<unknown, unknown> {
  return !!v && typeof v === 'object'
    && typeof (v as Map<unknown, unknown>).entries === 'function'
    && typeof (v as Map<unknown, unknown>).get === 'function'
}

function isSetLike(v: unknown): v is Set<unknown> {
  return !!v && typeof v === 'object'
    && typeof (v as Set<unknown>).has === 'function'
    && typeof (v as Set<unknown>)[Symbol.iterator] === 'function'
    && typeof (v as Map<unknown, unknown>).get !== 'function'
}

const createQuery = jora.setup({
  methods: {
    /** Map(-like) -> plain object (string-coerced keys). `idToModuleMap.fromMap()` */
    fromMap: v => isMapLike(v) ? Object.fromEntries(v.entries()) : v,
    /** Map(-like) -> [{ key, value }] preserving key identity. */
    mapEntries: v => isMapLike(v) ? [...v.entries()].map(([key, value]) => ({ key, value })) : [],
    /** Set(-like) -> array. */
    fromSet: v => isSetLike(v) ? [...v] : v,
    /** Constructor name of any value. */
    typeOf: (v) => {
      if (v === null)
        return 'null'
      if (typeof v !== 'object')
        return typeof v
      return (v as object).constructor?.name ?? 'Object'
    },
    /** All own keys (incl. non-enumerable), as strings. */
    ownKeys: v => (v && typeof v === 'object') ? Reflect.ownKeys(v).map(String) : [],
  },
})

export type { QueryOutcome } from './rpc-contract'

export function runQuery(target: unknown, query: string, options?: NormalizeOptions): QueryOutcome {
  try {
    const started = performance.now()
    const raw = createQuery(query)(target)
    const queryMs = Math.round((performance.now() - started) * 100) / 100
    const { data, stats } = normalize(raw, options)
    // The normalizer guarantees plain JSON, so this measures the actual wire payload.
    const payloadBytes = new TextEncoder().encode(JSON.stringify(data) ?? '').length
    return { ok: true, result: data, stats: { queryMs, normalize: stats, payloadBytes } }
  }
  catch (error) {
    const e = error instanceof Error ? error : new Error(String(error))
    return { ok: false, error: { message: e.message, name: e.name } }
  }
}

interface JoraStatEntry {
  type: string
  from: number
  to: number
  text: string
  suggestions: unknown[] | null
}

/**
 * jora stat mode: evaluates the (tolerant) query against the live object and
 * reports completions for the given cursor position. Each stat entry carries
 * its candidates in a nested `suggestions` array — flattened here into plain,
 * RPC-safe completion items. This is what makes remote autocomplete work.
 */
export function suggest(target: unknown, query: string, pos: number, limit = 30): SuggestOutcome {
  try {
    const started = performance.now()
    const statApi = createQuery(query, { tolerant: true, stat: true })(target) as {
      suggestion: (pos: number, opts?: { limit?: number }) => JoraStatEntry[] | null
    }
    const raw = statApi.suggestion(pos, { limit }) ?? []
    const statMs = Math.round((performance.now() - started) * 100) / 100
    const suggestions: SuggestItem[] = []
    for (const entry of raw) {
      for (const candidate of entry.suggestions ?? []) {
        suggestions.push({
          type: String(entry.type),
          from: entry.from,
          to: entry.to,
          current: String(entry.text ?? ''),
          value: String(candidate).slice(0, 200),
        })
        if (suggestions.length >= limit)
          break
      }
      if (suggestions.length >= limit)
        break
    }
    return { ok: true, suggestions, statMs }
  }
  catch (error) {
    return { ok: false, suggestions: [], statMs: 0, error: error instanceof Error ? error.message : String(error) }
  }
}
