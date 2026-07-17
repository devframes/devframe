/// <reference path="./jora.d.ts" />
/**
 * Isomorphic jora execution. Runs server-side against LIVE objects (dev,
 * agent-attach) and client-side against NORMALIZED datasets (static
 * exports), so the same saved query works in both worlds:
 *
 *   - the Map/Set bridge methods duck-type live collections, Map-shaped
 *     facades (Vite 8's compat module graph), AND the normalizer's tagged
 *     forms (`{ $type: 'Map', value }`), keeping queries portable;
 *   - suggestions come from jora's stat mode, flattened into plain
 *     RPC-safe completion items.
 */
import type { QueryOutcome, SuggestItem, SuggestOutcome } from './contract'
import type { NormalizeOptions } from './normalize'
import jora from 'jora'
import { normalize } from './normalize'

export type { SuggestItem, SuggestOutcome } from './contract'

interface MapTag { $type: 'Map', value?: Record<string, unknown>, entries?: { key: unknown, value: unknown }[] }
interface SetTag { $type: 'Set', values?: unknown[] }

function isMapTag(v: unknown): v is MapTag {
  return !!v && typeof v === 'object' && (v as MapTag).$type === 'Map'
}

function isSetTag(v: unknown): v is SetTag {
  return !!v && typeof v === 'object' && (v as SetTag).$type === 'Set'
}

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
    /** Map(-like or normalized tag) -> plain object (string-coerced keys). */
    fromMap: (v) => {
      if (isMapLike(v))
        return Object.fromEntries(v.entries())
      if (isMapTag(v))
        return v.value ?? Object.fromEntries((v.entries ?? []).map(e => [String(e.key), e.value]))
      return v
    },
    /** Map(-like or normalized tag) -> [{ key, value }] preserving key identity. */
    mapEntries: (v) => {
      if (isMapLike(v))
        return [...v.entries()].map(([key, value]) => ({ key, value }))
      if (isMapTag(v)) {
        if (v.entries)
          return v.entries
        return Object.entries(v.value ?? {}).map(([key, value]) => ({ key, value }))
      }
      return []
    },
    /** Set(-like or normalized tag) -> array. */
    fromSet: (v) => {
      if (isSetLike(v))
        return [...v]
      if (isSetTag(v))
        return v.values ?? []
      return v
    },
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
 * jora stat mode: evaluates the (tolerant) query against the target and
 * reports completions for the given cursor position. Each stat entry carries
 * its candidates in a nested `suggestions` array — flattened here into plain,
 * RPC-safe completion items.
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
