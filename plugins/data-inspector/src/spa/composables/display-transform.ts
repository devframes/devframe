/**
 * Display transform for the discovery struct view.
 *
 * The normalizer's meta tags (`$class`, `$type`, function stubs, Map/Set
 * wrappers) carry type info, but rendering them as plain props is noise once
 * badges exist. This transform rewrites a normalized result into its clean
 * display shape and parks the badge info in WeakMap side-tables the
 * annotation reads back:
 *
 *   - `{ $class: 'X', ...props }`             -> `{ ...props }`        + `class X` badge
 *   - `{ $type: 'function', name }`           -> `{}`                  + `fn name` badge
 *   - `{ $type: 'Map', size, value|entries }` -> inner object/array    + `Map(n)` badge
 *   - `{ $type: 'Set', size, values }`        -> values array          + `Set(n)` badge
 *   - `{ $type: 'Date'|'RegExp'|..., value }` -> the value string      + type badge (keyed by parent+key)
 *   - `{ $truncated: 'depth', $path, $preview }` -> the preview string  + a "load deeper" LINK badge (lazy expand)
 *   - `{ $ref }` / `{ $truncated: 'entries' }` -> untouched (informative as data)
 */
import type { NodePath } from '../../engine'

export interface DisplayBadge {
  text: string
  className: string
  /**
   * When set, the annotation renders as a link. Depth-truncation markers use
   * a `di-expand:<url-encoded NodePath>` href; the result viewer intercepts
   * clicks on it to lazily fetch and splice in the subtree.
   */
  href?: string
}

/** href scheme used by the lazy-expand link badge on depth-truncation markers. */
export const EXPAND_HREF_PREFIX = 'di-expand:'

/** Encode a node path into the lazy-expand link href. */
export function encodeExpandHref(path: NodePath): string {
  return EXPAND_HREF_PREFIX + encodeURIComponent(JSON.stringify(path))
}

/** Decode a lazy-expand link href back into a node path (null if not one). */
export function decodeExpandHref(href: string): NodePath | null {
  if (!href.startsWith(EXPAND_HREF_PREFIX))
    return null
  try {
    return JSON.parse(decodeURIComponent(href.slice(EXPAND_HREF_PREFIX.length))) as NodePath
  }
  catch {
    return null
  }
}

/**
 * Node path this render is rooted at — empty for the top-level result, and the
 * expanded node's path for a lazily fetched subtree, so its own truncation
 * markers carry absolute paths back to the root. Set for the duration of each
 * synchronous `prepareForDisplay` call.
 */
let currentBasePath: NodePath = []

/** Badges for transformed values that are objects/arrays (identity lookup). */
export const objectBadges = new WeakMap<object, DisplayBadge>()
/** Badges for primitive-valued entries, keyed by (parent object, key). */
export const keyBadges = new WeakMap<object, Record<string | number, DisplayBadge>>()

const KIND_BY_TYPE: Record<string, string> = {
  'function': 'di-type-function',
  'Map': 'di-type-map',
  'Set': 'di-type-set',
  'Date': 'di-type-date',
  'RegExp': 'di-type-date',
  'URL': 'di-type-date',
  'bigint': 'di-type-other',
  'symbol': 'di-type-other',
  'Error': 'di-type-ref',
  'getter-error': 'di-type-ref',
  'Promise': 'di-type-other',
}

interface Walked {
  value: unknown
  badge?: DisplayBadge
}

function badgeFor(type: string, extra?: string): DisplayBadge {
  return { text: extra ?? type, className: `di-type-badge ${KIND_BY_TYPE[type] ?? 'di-type-other'}` }
}

function walk(value: unknown): Walked {
  if (!value || typeof value !== 'object')
    return { value }

  if (Array.isArray(value)) {
    const out: unknown[] = Array.from({ length: value.length })
    const childKeyBadges: Record<number, DisplayBadge> = {}
    let hasKeyBadges = false
    value.forEach((item, i) => {
      const walked = walk(item)
      out[i] = walked.value
      if (walked.badge) {
        if (walked.value && typeof walked.value === 'object') {
          objectBadges.set(walked.value as object, walked.badge)
        }
        else {
          childKeyBadges[i] = walked.badge
          hasKeyBadges = true
        }
      }
    })
    if (hasKeyBadges)
      keyBadges.set(out, childKeyBadges)
    return { value: out }
  }

  const obj = value as Record<string, unknown>

  // ── depth-truncation marker: render the preview as a lazy-expand link ─
  if (obj.$truncated === 'depth' && Array.isArray(obj.$path)) {
    const preview = typeof obj.$preview === 'string' ? obj.$preview : 'load deeper'
    const absolute = [...currentBasePath, ...(obj.$path as NodePath)]
    return {
      value: preview,
      badge: {
        text: 'load deeper',
        className: 'di-type-badge di-type-lazy',
        href: encodeExpandHref(absolute),
      },
    }
  }

  // ── normalizer stubs ────────────────────────────────────────────────
  if (typeof obj.$type === 'string') {
    const type = obj.$type
    switch (type) {
      case 'function': {
        const name = typeof obj.name === 'string' && obj.name !== '(anonymous)' ? obj.name : ''
        return { value: name ? `<function ${name}>` : '<function>', badge: badgeFor('function', 'Function') }
      }
      case 'Map': {
        const inner = walk(obj.value ?? obj.entries ?? {})
        return { value: inner.value, badge: badgeFor('Map', `Map(${obj.size ?? '?'})`) }
      }
      case 'Set': {
        const inner = walk(obj.values ?? [])
        return { value: inner.value, badge: badgeFor('Set', `Set(${obj.size ?? '?'})`) }
      }
      case 'Date':
      case 'RegExp':
      case 'URL':
      case 'bigint':
      case 'symbol':
        return { value: obj.value, badge: badgeFor(type, type === 'bigint' ? 'BigInt' : type === 'symbol' ? 'Symbol' : type) }
      case 'Error':{
        const clone = { ...obj }
        delete clone.$type
        return { value: clone, badge: badgeFor('Error') }
      }
      case 'getter-error':
        return { value: String(obj.message ?? ''), badge: badgeFor('getter-error', 'getter threw') }
      default:
        // Promise, WeakMap, TypedArray tags, ... - opaque stubs
        return {
          value: `<${type}>`,
          badge: badgeFor(type, typeof obj.length === 'number' ? `${type}(${obj.length})` : type),
        }
    }
  }

  // ── plain object / class instance ───────────────────────────────────
  const out: Record<string, unknown> = {}
  const childKeyBadges: Record<string, DisplayBadge> = {}
  let hasKeyBadges = false
  let classBadge: DisplayBadge | undefined

  for (const [key, child] of Object.entries(obj)) {
    if (key === '$class' && typeof child === 'string') {
      classBadge = { text: `class ${child}`, className: 'di-type-badge di-type-class' }
      continue
    }
    const walked = walk(child)
    out[key] = walked.value
    if (walked.badge) {
      if (walked.value && typeof walked.value === 'object') {
        objectBadges.set(walked.value as object, walked.badge)
      }
      else {
        childKeyBadges[key] = walked.badge
        hasKeyBadges = true
      }
    }
  }
  if (hasKeyBadges)
    keyBadges.set(out, childKeyBadges)
  return { value: out, badge: classBadge }
}

/**
 * Rewrite a normalized result into its display shape; badges land in the
 * tables. `basePath` roots a lazily fetched subtree so its own truncation
 * markers keep absolute paths back to the query root (empty for the top level).
 */
export function prepareForDisplay(result: unknown, basePath: NodePath = []): unknown {
  currentBasePath = basePath
  try {
    const walked = walk(result)
    if (walked.badge && walked.value && typeof walked.value === 'object')
      objectBadges.set(walked.value as object, walked.badge)
    return walked.value
  }
  finally {
    currentBasePath = []
  }
}
