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
 *   - `{ $ref }` / `{ $truncated }`           -> untouched (informative as data)
 */

export interface DisplayBadge {
  text: string
  className: string
}

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

/** Rewrite a normalized result into its display shape; badges land in the tables. */
export function prepareForDisplay(result: unknown): unknown {
  const walked = walk(result)
  if (walked.badge && walked.value && typeof walked.value === 'object')
    objectBadges.set(walked.value as object, walked.badge)
  return walked.value
}
