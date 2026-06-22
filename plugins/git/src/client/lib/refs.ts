// Parse the raw ref strings git emits for each commit (`%D`, already split on
// `', '`) into structured tokens the commit graph can render as labels. Git
// hands us entries like `HEAD -> main`, `origin/feature/x`, `tag: v1.0.0`, or
// a bare `HEAD` (detached). `origin/HEAD` is noise and is dropped.

export type GitRef
  = | { kind: 'head' }
    | { kind: 'branch', name: string, current: boolean }
    | { kind: 'remote', remote: string, name: string }
    | { kind: 'tag', name: string }

// Display priority — labels are laid out right-aligned against the graph node,
// so a higher rank floats closest to the node (rendered last). The current
// branch always wins, then local branches, tags, remotes, and finally HEAD.
const RANK: Record<GitRef['kind'], number> = {
  remote: 0,
  head: 1,
  tag: 2,
  branch: 3,
}

function rank(ref: GitRef): number {
  if (ref.kind === 'branch' && ref.current)
    return 4
  return RANK[ref.kind]
}

/**
 * Turn git's raw ref strings into ordered {@link GitRef} tokens. `current` is
 * the active branch name (from `git status`), used to flag the checked-out
 * branch even when the ref list lacks an explicit `HEAD -> …` arrow.
 */
export function parseRefs(refs: string[], current?: string | null): GitRef[] {
  const out: GitRef[] = []

  for (const raw of refs) {
    const ref = raw.trim()
    if (!ref)
      continue

    if (ref.startsWith('tag: ')) {
      out.push({ kind: 'tag', name: ref.slice(5).trim() })
      continue
    }

    if (ref.includes('->')) {
      // `HEAD -> main`
      const name = ref.split('->')[1]?.trim()
      if (name)
        out.push({ kind: 'branch', name, current: true })
      continue
    }

    if (ref === 'HEAD') {
      out.push({ kind: 'head' })
      continue
    }

    const slash = ref.indexOf('/')
    if (slash > 0) {
      const remote = ref.slice(0, slash)
      const name = ref.slice(slash + 1)
      if (name === 'HEAD')
        continue // skip the symbolic `origin/HEAD`
      out.push({ kind: 'remote', remote, name })
      continue
    }

    out.push({ kind: 'branch', name: ref, current: current === ref })
  }

  return out.sort((a, b) => rank(a) - rank(b))
}
