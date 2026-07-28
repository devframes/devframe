import { resolve } from 'pathe'
import { diagnostics } from '../diagnostics'

/**
 * Resolve a client-supplied, root-relative path against the managed
 * directory, rejecting anything that would escape it (`..` traversal, a
 * rogue absolute path, etc.). Every RPC handler that touches the
 * filesystem goes through this — never trust a path from the wire.
 */
export function resolveAssetPath(root: string, relativePath: string): string {
  const cleaned = relativePath.replace(/^[/\\]+/, '')
  const normalizedRoot = resolve(root)
  const absolute = resolve(normalizedRoot, cleaned)
  if (absolute !== normalizedRoot && !absolute.startsWith(`${normalizedRoot}/`))
    throw diagnostics.DP_ASSETS_0001({ path: relativePath })
  return absolute
}
