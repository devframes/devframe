import fsp from 'node:fs/promises'
import { dirname, normalize, resolve } from 'pathe'
import { diagnostics } from '../diagnostics'

/**
 * Resolve a client-supplied, root-relative path against the managed
 * directory, rejecting anything that would escape it (`..` traversal, a
 * rogue absolute path, etc.). This is the lexical guard every RPC handler
 * that touches the filesystem goes through first — never trust a path from
 * the wire.
 *
 * Lexical checks alone cannot see symlinks: use {@link resolveAssetReadPath}
 * (reads) or {@link assertAssetMutationPath} (mutations) to also close
 * pre-existing symlink escapes.
 */
export function resolveAssetPath(root: string, relativePath: string): string {
  const cleaned = relativePath.replace(/^[/\\]+/, '')
  const normalizedRoot = resolve(root)
  const absolute = resolve(normalizedRoot, cleaned)
  if (absolute !== normalizedRoot && !absolute.startsWith(`${normalizedRoot}/`))
    throw diagnostics.DP_ASSETS_0001({ path: relativePath })
  return absolute
}

/** `child === root` or a path nested beneath it, using pathe's `/` separator. */
function isWithin(child: string, root: string): boolean {
  return child === root || child.startsWith(`${root}/`)
}

/**
 * The canonical (symlink-resolved) managed root. Falls back to the lexical
 * path when the directory does not exist yet.
 */
async function canonicalRoot(root: string): Promise<string> {
  const normalizedRoot = resolve(root)
  try {
    return normalize(await fsp.realpath(normalizedRoot))
  }
  catch {
    return normalizedRoot
  }
}

/**
 * Canonical path of the nearest existing ancestor of `absolute` (the target
 * itself when it exists), with every symlink along the way resolved.
 */
async function nearestExistingCanonical(absolute: string): Promise<string> {
  let current = absolute
  for (;;) {
    try {
      return normalize(await fsp.realpath(current))
    }
    catch {
      const parent = dirname(current)
      if (parent === current)
        return current
      current = parent
    }
  }
}

/**
 * Resolve a path for a **read**, allowing a symlink only when its canonical
 * target stays inside the canonical managed root. Lexical escapes and
 * symlinks whose canonical target leaves the root both throw
 * `DP_ASSETS_0001`.
 */
export async function resolveAssetReadPath(root: string, relativePath: string): Promise<string> {
  const absolute = resolveAssetPath(root, relativePath)
  const canonRoot = await canonicalRoot(root)
  const nearest = await nearestExistingCanonical(absolute)
  if (!isWithin(nearest, canonRoot))
    throw diagnostics.DP_ASSETS_0001({ path: relativePath })
  return absolute
}

/**
 * Resolve a path for a **mutation**, rejecting every pre-existing symlink
 * among the path components from the managed root down to the target —
 * including in-root symlinks — so a mutation can never follow a symlink out
 * of (or around) the root. Walks only components that already exist, so it
 * is safe for not-yet-created upload/mkdir targets; call it again after
 * creating directories and immediately before the mutating I/O to re-check
 * the freshly materialized components.
 *
 * This closes deterministic, pre-existing symlink escapes; it does not
 * defeat a concurrent local process swapping a component between this check
 * and the I/O.
 */
export async function assertAssetMutationPath(root: string, relativePath: string): Promise<string> {
  const absolute = resolveAssetPath(root, relativePath)
  const canonRoot = await canonicalRoot(root)
  const lexicalRoot = resolve(root)
  const rel = absolute === lexicalRoot ? '' : absolute.slice(lexicalRoot.length + 1)
  const segments = rel ? rel.split('/') : []

  let current = canonRoot
  for (const segment of segments) {
    current = `${current}/${segment}`
    let stat
    try {
      stat = await fsp.lstat(current)
    }
    catch {
      // This component does not exist yet — nothing deeper can either, so
      // there is no pre-existing symlink left to reject.
      break
    }
    if (stat.isSymbolicLink())
      throw diagnostics.DP_ASSETS_0001({ path: relativePath })
  }
  return absolute
}
