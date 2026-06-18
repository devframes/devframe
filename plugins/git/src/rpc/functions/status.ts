import { defineRpcFunction } from 'devframe'
import { runGit } from '../../node/git.ts'
import { getGitContext } from '../context.ts'

export type FileStatusCode
  = | 'modified'
    | 'added'
    | 'deleted'
    | 'renamed'
    | 'copied'
    | 'type-changed'
    | 'unmerged'
    | 'unknown'

export interface StatusFileEntry {
  path: string
  /** Previous path, present for renames and copies. */
  from?: string
  status: FileStatusCode
}

export interface GitStatus {
  /** `false` when the working directory is not inside a git repository. */
  isRepo: boolean
  root: string | null
  /** Current branch name, or `null` when HEAD is detached. */
  branch: string | null
  detached: boolean
  /** Short HEAD object name. */
  head: string | null
  upstream: string | null
  ahead: number
  behind: number
  staged: StatusFileEntry[]
  unstaged: StatusFileEntry[]
  untracked: string[]
  /** `true` when there are no staged, unstaged, or untracked changes. */
  clean: boolean
}

const EMPTY_STATUS: GitStatus = {
  isRepo: false,
  root: null,
  branch: null,
  detached: false,
  head: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  untracked: [],
  clean: true,
}

function mapCode(code: string): FileStatusCode {
  switch (code) {
    case 'M': return 'modified'
    case 'A': return 'added'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case 'C': return 'copied'
    case 'T': return 'type-changed'
    case 'U': return 'unmerged'
    default: return 'unknown'
  }
}

/**
 * Parse `git status --porcelain=v2 --branch -z` into a structured snapshot.
 * Records are NUL-separated; rename/copy (type `2`) entries consume an extra
 * token for the original path.
 */
function parseStatus(root: string, raw: string): GitStatus {
  const tokens = raw.split('\0')
  const status: GitStatus = { ...EMPTY_STATUS, isRepo: true, root, staged: [], unstaged: [], untracked: [] }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token)
      continue

    if (token.startsWith('# ')) {
      const [, key, ...rest] = token.split(' ')
      const value = rest.join(' ')
      if (key === 'branch.head') {
        if (value === '(detached)') {
          status.detached = true
          status.branch = null
        }
        else {
          status.branch = value
        }
      }
      else if (key === 'branch.oid' && value !== '(initial)') {
        status.head = value.slice(0, 9)
      }
      else if (key === 'branch.upstream') {
        status.upstream = value
      }
      else if (key === 'branch.ab') {
        const match = value.match(/\+(\d+)\s+-(\d+)/)
        if (match) {
          status.ahead = Number(match[1])
          status.behind = Number(match[2])
        }
      }
      continue
    }

    if (token.startsWith('1 ') || token.startsWith('2 ')) {
      const renamed = token.startsWith('2 ')
      const fields = token.split(' ')
      const xy = fields[1]
      const x = xy[0]
      const y = xy[1]
      // Type 1 path begins at field 8; type 2 inserts the rename score at
      // field 8, pushing the path to field 9 and the original to a NUL token.
      const path = fields.slice(renamed ? 9 : 8).join(' ')
      const from = renamed ? tokens[++i] : undefined

      if (x !== '.') {
        status.staged.push(from ? { path, from, status: mapCode(x) } : { path, status: mapCode(x) })
      }
      if (y !== '.') {
        status.unstaged.push({ path, status: mapCode(y) })
      }
      continue
    }

    if (token.startsWith('u ')) {
      const path = token.split(' ').slice(10).join(' ')
      status.unstaged.push({ path, status: 'unmerged' })
      continue
    }

    if (token.startsWith('? ')) {
      status.untracked.push(token.slice(2))
    }
  }

  status.clean = status.staged.length === 0
    && status.unstaged.length === 0
    && status.untracked.length === 0
  return status
}

export const status = defineRpcFunction({
  name: 'git:status',
  type: 'query',
  snapshot: true,
  jsonSerializable: true,
  setup: (ctx) => {
    const git = getGitContext(ctx)
    return {
      handler: async (): Promise<GitStatus> => {
        const root = await git.resolveRoot()
        if (!root)
          return EMPTY_STATUS
        const { stdout } = await runGit(git.cwd, ['status', '--porcelain=v2', '--branch', '-z'])
        return parseStatus(root, stdout)
      },
    }
  },
})
