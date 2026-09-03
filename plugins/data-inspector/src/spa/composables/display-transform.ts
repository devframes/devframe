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
import type { NodePath, PathSegment } from '../../engine'

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
const EXPAND_HREF_PREFIX = 'di-expand:'

/** href scheme used by the edit link badge on writable-source nodes. */
const EDIT_HREF_PREFIX = 'di-edit:'

/** Encode a node path into the edit link href. */
export function encodeEditHref(path: NodePath): string {
  return EDIT_HREF_PREFIX + encodeURIComponent(JSON.stringify(path))
}

/** Decode an edit link href back into a node path (null if not one). */
export function decodeEditHref(href: string): NodePath | null {
  if (!href.startsWith(EDIT_HREF_PREFIX))
    return null
  try {
    return JSON.parse(decodeURIComponent(href.slice(EDIT_HREF_PREFIX.length))) as NodePath
  }
  catch {
    return null
  }
}

/** Encode a node path into the lazy-expand link href. */
function encodeExpandHref(path: NodePath): string {
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
 * Node path this render is rooted at, empty for the top-level result, and the
 * expanded node's path for a lazily fetched subtree, so its own truncation
 * markers carry absolute paths back to the root. Set for the duration of each
 * synchronous `prepareForDisplay` call.
 */
let currentBasePath: NodePath = []

/** Badges for transformed values that are objects/arrays (identity lookup). */
export const objectBadges = new WeakMap<object, DisplayBadge>()
/** Badges for primitive-valued entries, keyed by (parent object, key). */
export const keyBadges = new WeakMap<object, Record<string | number, DisplayBadge>>()

/**
 * Source `NodePath`s for display nodes, recorded only when path TRACKING is
 * on (a writable source rendered through the identity query, the one case
 * where display nodes provably address the live object). Object/array nodes
 * by identity; primitive-valued entries keyed by (parent object, key).
 */
export const nodePaths = new WeakMap<object, NodePath>()
export const childNodePaths = new WeakMap<object, Record<string | number, NodePath>>()

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

/**
 * True for normalizer markers whose display shape no longer mirrors the live
 * structure, so their children must not carry source paths.
 */
function isUntrackable(value: unknown): boolean {
  return !!value && typeof value === 'object'
    && ('$ref' in (value as object) || '$truncated' in (value as object))
}

/** Record a walked child's source path in the side-tables. */
function recordChildPath(
  childValue: unknown,
  path: NodePath,
  parent: object,
  key: string | number,
  primitivePaths: Record<string | number, NodePath>,
): boolean {
  if (childValue && typeof childValue === 'object') {
    nodePaths.set(childValue as object, path)
    return false
  }
  primitivePaths[key] = path
  return true
}

function walk(value: unknown, track: NodePath | null, segKind: 'i' | 's' = 'i'): Walked {
  if (!value || typeof value !== 'object')
    return { value }

  if (Array.isArray(value))
    return walkArray(value, track, segKind)

  const obj = value as Record<string, unknown>

  // Depth-truncation marker: render the preview as a lazy-expand link.
  if (obj.$truncated === 'depth' && Array.isArray(obj.$path))
    return walkTruncatedDepth(obj)

  if (typeof obj.$type === 'string')
    return walkTypeStub(obj, obj.$type, track)

  return walkPlainObject(obj, track)
}

/** Route a walked child's badge into the object table or the key table. */
function assignChildBadge(key: string | number, walked: Walked, childKeyBadges: Record<string | number, DisplayBadge>): boolean {
  if (!walked.badge)
    return false
  if (walked.value && typeof walked.value === 'object') {
    objectBadges.set(walked.value as object, walked.badge)
    return false
  }
  childKeyBadges[key] = walked.badge
  return true
}

function walkArray(value: unknown[], track: NodePath | null, segKind: 'i' | 's'): Walked {
  const out: unknown[] = Array.from({ length: value.length })
  const childKeyBadges: Record<string | number, DisplayBadge> = {}
  const childPaths: Record<string | number, NodePath> = {}
  let hasKeyBadges = false
  let hasChildPaths = false
  value.forEach((item, i) => {
    const childTrack = track && !isUntrackable(item) ? [...track, [segKind, i] as PathSegment] : null
    const walked = walk(item, childTrack)
    out[i] = walked.value
    if (childTrack && recordChildPath(walked.value, childTrack, out, i, childPaths))
      hasChildPaths = true
    if (assignChildBadge(i, walked, childKeyBadges))
      hasKeyBadges = true
  })
  if (hasKeyBadges)
    keyBadges.set(out, childKeyBadges)
  if (hasChildPaths)
    childNodePaths.set(out, childPaths)
  return { value: out }
}

function walkTruncatedDepth(obj: Record<string, unknown>): Walked {
  const preview = typeof obj.$preview === 'string' ? obj.$preview : 'load deeper'
  const absolute = [...currentBasePath, ...(obj.$path as NodePath)]
  return {
    value: preview,
    badge: { text: 'load deeper', className: 'di-type-badge di-type-lazy', href: encodeExpandHref(absolute) },
  }
}

function walkTypeStub(obj: Record<string, unknown>, type: string, track: NodePath | null): Walked {
  switch (type) {
    case 'function': {
      const name = typeof obj.name === 'string' && obj.name !== '(anonymous)' ? obj.name : ''
      return { value: name ? `<function ${name}>` : '<function>', badge: badgeFor('function', 'Function') }
    }
    case 'Map': {
      // String-keyed Maps (`value` form) descend with `['k', key]` steps,
      // matching `navigate`; the `entries` form's display shape (an array
      // of `{ key, value }` pairs) no longer mirrors the live Map, so its
      // children carry no source paths.
      const inner = obj.value !== undefined
        ? walk(obj.value, track)
        : walk(obj.entries ?? {}, null)
      return { value: inner.value, badge: badgeFor('Map', `Map(${obj.size ?? '?'})`) }
    }
    case 'Set': {
      const inner = walk(obj.values ?? [], track, 's')
      return { value: inner.value, badge: badgeFor('Set', `Set(${obj.size ?? '?'})`) }
    }
    case 'Date':
    case 'RegExp':
    case 'URL':
    case 'bigint':
    case 'symbol':
      return { value: obj.value, badge: badgeFor(type, type === 'bigint' ? 'BigInt' : type === 'symbol' ? 'Symbol' : type) }
    case 'Error': {
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

/** The source path for an object property, unless the child is untrackable. */
function childTrackFor(trackChildren: NodePath | null, key: string, child: unknown): NodePath | null {
  return trackChildren && key !== '$truncated' && !isUntrackable(child)
    ? [...trackChildren, ['k', key] as PathSegment]
    : null
}

function walkPlainObject(obj: Record<string, unknown>, track: NodePath | null): Walked {
  const out: Record<string, unknown> = {}
  const childKeyBadges: Record<string | number, DisplayBadge> = {}
  const childPaths: Record<string | number, NodePath> = {}
  let hasKeyBadges = false
  let hasChildPaths = false
  let classBadge: DisplayBadge | undefined
  // `$ref` / `$truncated` carriers pass through as data; their props are
  // normalizer bookkeeping, not live structure.
  const trackChildren = track && !isUntrackable(obj) ? track : null

  for (const [key, child] of Object.entries(obj)) {
    if (key === '$class' && typeof child === 'string') {
      classBadge = { text: `class ${child}`, className: 'di-type-badge di-type-class' }
      continue
    }
    const childTrack = childTrackFor(trackChildren, key, child)
    const walked = walk(child, childTrack)
    out[key] = walked.value
    if (childTrack && recordChildPath(walked.value, childTrack, out, key, childPaths))
      hasChildPaths = true
    if (assignChildBadge(key, walked, childKeyBadges))
      hasKeyBadges = true
  }
  if (hasKeyBadges)
    keyBadges.set(out, childKeyBadges)
  if (hasChildPaths)
    childNodePaths.set(out, childPaths)
  return { value: out, badge: classBadge }
}

/**
 * Descend a NORMALIZED result along a `NodePath` (the client-side mirror of
 * the server's live-graph `navigate`), for prefilling the edit panel with the
 * value currently on screen. Returns `undefined` when a step falls off.
 */
export function navigateNormalized(result: unknown, path: NodePath): unknown {
  let cur = result
  for (const [kind, at] of path) {
    if (!cur || typeof cur !== 'object')
      return undefined
    const obj = cur as Record<string, unknown>
    switch (kind) {
      case 'k':
        cur = obj.$type === 'Map'
          ? (obj.value as Record<string, unknown> | undefined)?.[at]
          : obj[at]
        break
      case 'i':
        cur = Array.isArray(cur) ? (cur as unknown[])[at] : undefined
        break
      case 's':
        cur = obj.$type === 'Set' ? (obj.values as unknown[] | undefined)?.[at] : undefined
        break
      case 'mk':
        cur = (obj.entries as { key: unknown, value: unknown }[] | undefined)?.[at]?.key
        break
      case 'mv':
        cur = (obj.entries as { key: unknown, value: unknown }[] | undefined)?.[at]?.value
        break
    }
  }
  return cur
}

/** Human-readable form of a `NodePath` for the edit panel breadcrumb. */
export function formatNodePath(path: NodePath): string {
  if (!path.length)
    return '$'
  return `$${path.map(([kind, at]) => {
    switch (kind) {
      case 'k': return /^[a-z_$][\w$]*$/i.test(String(at)) ? `.${at}` : `["${at}"]`
      case 'i': return `[${at}]`
      case 's': return `~set[${at}]`
      case 'mk': return `~keys[${at}]`
      case 'mv': return `~values[${at}]`
      default: return ''
    }
  }).join('')}`
}

/**
 * Rewrite a normalized result into its display shape; badges land in the
 * tables. `basePath` roots a lazily fetched subtree so its own truncation
 * markers keep absolute paths back to the query root (empty for the top
 * level). With `trackPaths` on (writable source, identity query), every
 * display node that provably addresses the live object also lands in the
 * `nodePaths` / `childNodePaths` side-tables, powering the edit affordance.
 */
export function prepareForDisplay(result: unknown, basePath: NodePath = [], trackPaths = false): unknown {
  currentBasePath = basePath
  try {
    const walked = walk(result, trackPaths && !isUntrackable(result) ? basePath : null)
    if (walked.badge && walked.value && typeof walked.value === 'object')
      objectBadges.set(walked.value as object, walked.badge)
    if (trackPaths && walked.value && typeof walked.value === 'object' && !isUntrackable(result))
      nodePaths.set(walked.value as object, basePath)
    return walked.value
  }
  finally {
    currentBasePath = []
  }
}
