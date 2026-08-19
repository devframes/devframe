import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { isAbsolute, join } from 'pathe'

/**
 * Turn a `resolveFrom` value (a file path, a file URL like `import.meta.url`,
 * or a directory) into something `createRequire` accepts — a directory gets a
 * synthetic filename appended so resolution starts inside it.
 */
function toRequireBase(resolveFrom: string): string {
  if (resolveFrom.startsWith('file://'))
    return resolveFrom
  // A path with an extension in its last segment is already file-like;
  // anything else is treated as a directory.
  const lastSegment = resolveFrom.split(/[/\\]/).pop() ?? ''
  if (lastSegment.includes('.'))
    return resolveFrom
  return join(resolveFrom, '_devframe_resolve.js')
}

/**
 * Normalize an `install()` `resolveFrom` into a resolution base. Paths and
 * file URLs pass through; a bare npm package name (the common case: the
 * declaring plugin's `packageName`) resolves to that package's location from
 * `cwd`, so a service it declares resolves against the plugin's own
 * dependencies. An unresolvable package name reads as no base (the caller's
 * workspace fallbacks apply).
 */
export function expandResolveFrom(resolveFrom: string, cwd: string): string | undefined {
  if (resolveFrom.startsWith('file://') || resolveFrom.startsWith('.') || isAbsolute(resolveFrom))
    return resolveFrom
  const require = createRequire(join(cwd, '_devframe_resolve.js'))
  try {
    return require.resolve(`${resolveFrom}/package.json`)
  }
  catch {}
  try {
    return require.resolve(resolveFrom)
  }
  catch {}
  return undefined
}

/**
 * Import a service package's module, trying each `resolveFrom` candidate in
 * order (so a plugin-declared service resolves against the plugin's own
 * dependency tree first, then the workspace fallback). Throws the last
 * resolution error when no candidate succeeds.
 */
export async function importServicePackage(
  pkg: string,
  resolveFroms: readonly (string | null | undefined)[],
): Promise<unknown> {
  const candidates = [...new Set(resolveFroms.filter((x): x is string => typeof x === 'string' && x.length > 0))]
  let lastError: unknown = new Error(`no resolution base available for "${pkg}"`)
  for (const from of candidates) {
    let resolved: string
    try {
      resolved = createRequire(toRequireBase(from)).resolve(pkg)
    }
    catch (error) {
      lastError = error
      continue
    }
    return await import(pathToFileURL(resolved).href)
  }
  throw lastError
}

interface ParsedVersion {
  parts: number[]
  prerelease?: string
}

function parseVersion(input: string): ParsedVersion | undefined {
  const trimmed = input.trim().replace(/^v/, '')
  const [core, ...prerelease] = trimmed.split('-')
  if (!core)
    return undefined
  const parts = core.split('.').map(part => Number.parseInt(part, 10))
  if (parts.length === 0 || parts.some(part => Number.isNaN(part) || part < 0))
    return undefined
  while (parts.length < 3)
    parts.push(0)
  return { parts, ...(prerelease.length ? { prerelease: prerelease.join('-') } : {}) }
}

function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  for (let i = 0; i < 3; i++) {
    const diff = (a.parts[i] ?? 0) - (b.parts[i] ?? 0)
    if (diff !== 0)
      return diff
  }
  // A prerelease sorts before its release (1.0.0-beta < 1.0.0).
  if (a.prerelease && !b.prerelease)
    return -1
  if (!a.prerelease && b.prerelease)
    return 1
  if (a.prerelease && b.prerelease)
    return a.prerelease < b.prerelease ? -1 : a.prerelease > b.prerelease ? 1 : 0
  return 0
}

function satisfiesComparator(version: ParsedVersion, comparator: string): boolean {
  const raw = comparator.trim()
  if (!raw || raw === '*' || raw === 'x')
    return true

  const operatorMatch = raw.match(/^([\^~]|>=|<=|[><=])?(.+)$/)
  if (!operatorMatch)
    return false
  const operator = operatorMatch[1]
  const rest = operatorMatch[2]!.trim()

  // Partial versions (`1`, `1.2`, `1.2.x`) — prefix (x-range) semantics for
  // the bare / `=` forms; padded with zeros for the ordered comparators.
  const segments = rest.replace(/\.[x*]/gi, '').split('.').filter(Boolean)
  const base = parseVersion(rest.replace(/[x*]/gi, '0'))
  if (!base)
    return false

  switch (operator) {
    case '>':
      return compareVersions(version, base) > 0
    case '>=':
      return compareVersions(version, base) >= 0
    case '<':
      return compareVersions(version, base) < 0
    case '<=':
      return compareVersions(version, base) <= 0
    case '^': {
      if (compareVersions(version, base) < 0)
        return false
      // Left-most non-zero element is fixed (npm caret semantics).
      const fixedIndex = base.parts.findIndex(part => part !== 0)
      const lockUpTo = fixedIndex === -1 ? base.parts.length - 1 : fixedIndex
      for (let i = 0; i <= lockUpTo; i++) {
        if ((version.parts[i] ?? 0) !== (base.parts[i] ?? 0))
          return false
      }
      return true
    }
    case '~': {
      if (compareVersions(version, base) < 0)
        return false
      // Same major (and same minor when the range specifies one).
      const lockUpTo = segments.length >= 2 ? 1 : 0
      for (let i = 0; i <= lockUpTo; i++) {
        if ((version.parts[i] ?? 0) !== (base.parts[i] ?? 0))
          return false
      }
      return true
    }
    default: {
      // Bare / `=` — exact for full versions, prefix match for partials.
      for (let i = 0; i < Math.max(segments.length, 3); i++) {
        if (i < segments.length && (version.parts[i] ?? 0) !== (base.parts[i] ?? 0))
          return false
      }
      return segments.length >= 3 ? compareVersions(version, base) === 0 : true
    }
  }
}

/**
 * Pragmatic semver range check for service version declarations — supports
 * the common forms (`1.2.3`, `^1.2.3`, `~1.2`, `>=1 <3`, `1.x`, `*`, and
 * `||`-joined alternatives) without pulling in a semver dependency. An
 * unparseable version or range reads as **not satisfied**.
 */
export function satisfiesVersionRange(version: string, range: string): boolean {
  const parsed = parseVersion(version)
  if (!parsed)
    return false
  const alternatives = range.split('||').map(alt => alt.trim()).filter(Boolean)
  if (alternatives.length === 0)
    return true
  return alternatives.some(alternative =>
    alternative.split(/\s+/).every(comparator => satisfiesComparator(parsed, comparator)),
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Deep-merge two values with the service option-set rules (see below). */
function deepMergeTwo(a: unknown, b: unknown): unknown {
  // Arrays union-dedupe, so multiple installers' `roots` / `langs` accumulate.
  if (Array.isArray(a) && Array.isArray(b))
    return [...new Set([...a, ...b])]
  if (isPlainObject(a) && isPlainObject(b)) {
    const out: Record<string, unknown> = { ...a }
    for (const key of Object.keys(b))
      out[key] = key in a ? deepMergeTwo(a[key], b[key]) : b[key]
    return out
  }
  // Scalars / mismatched shapes: later set wins (e.g. `themes` per key).
  return b
}

/**
 * Default option-set merge when a service declares no `mergeOptions`:
 * deep-merge in declaration order — objects recurse, arrays union-dedupe,
 * scalars take the later value. Covers the built-in services (`roots` /
 * `langs` union, `themes` per-key last-wins) without a custom hook.
 */
export function deepMergeOptionSets<Options>(sets: Options[]): Options {
  return sets.reduce((merged, set) => deepMergeTwo(merged, set) as Options)
}
