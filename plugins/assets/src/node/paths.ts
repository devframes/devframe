import fsp from 'node:fs/promises'
import { normalize, resolve } from 'pathe'
import { diagnostics } from '../diagnostics'

/** realpath, pathe-normalized, or `null` when the path doesn't exist. */
async function realpath(path: string): Promise<string | null> {
  try {
    return normalize(await fsp.realpath(path))
  }
  catch {
    return null
  }
}

/**
 * Resolve a client-supplied, root-relative path against the managed
 * directory, rejecting anything that would escape it lexically (`..`
 * traversal, a rogue absolute path). The first guard every RPC handler runs;
 * symlink-aware containment is layered on by {@link resolveAssetReadPath}
 * (reads) and {@link assertAssetMutationPath} (mutations).
 */
export function resolveAssetPath(root: string, relativePath: string): string {
  const normalizedRoot = resolve(root)
  const absolute = resolve(normalizedRoot, relativePath.replace(/^[/\\]+/, ''))
  if (absolute !== normalizedRoot && !absolute.startsWith(`${normalizedRoot}/`))
    throw diagnostics.DP_ASSETS_0001({ path: relativePath })
  return absolute
}

/**
 * Resolve a path for a **read**, allowing a symlink only when its canonical
 * target stays inside the canonical managed root. A target resolving outside
 * throws `DP_ASSETS_0001`; a missing target is left for the caller's own read
 * to fail.
 */
export async function resolveAssetReadPath(root: string, relativePath: string): Promise<string> {
  const absolute = resolveAssetPath(root, relativePath)
  const real = await realpath(absolute)
  const canonRoot = (await realpath(root)) ?? resolve(root)
  if (real && real !== canonRoot && !real.startsWith(`${canonRoot}/`))
    throw diagnostics.DP_ASSETS_0001({ path: relativePath })
  return absolute
}

/**
 * Resolve a path for a **mutation**, rejecting every pre-existing symlink
 * among the path components from the managed root down to the target
 * (including in-root symlinks) so a mutation can never follow a symlink out
 * of, or around, the root. Only existing components are inspected, so it is
 * safe for not-yet-created upload/mkdir targets — call it again after
 * creating directories and right before the I/O. This closes deterministic,
 * pre-existing symlink escapes, not concurrent component-swap races.
 */
export async function assertAssetMutationPath(root: string, relativePath: string): Promise<string> {
  const lexRoot = resolve(root)
  const absolute = resolveAssetPath(root, relativePath)
  let current = (await realpath(root)) ?? lexRoot
  for (const segment of absolute.slice(lexRoot.length).split('/').filter(Boolean)) {
    current += `/${segment}`
    const stat = await fsp.lstat(current).catch(() => null)
    if (!stat)
      break
    if (stat.isSymbolicLink())
      throw diagnostics.DP_ASSETS_0001({ path: relativePath })
  }
  return absolute
}
