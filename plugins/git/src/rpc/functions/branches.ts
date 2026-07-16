import { defineRpcFunction } from 'devframe'
import { splitClean, tryGit, UNIT } from '../../node/git.ts'
import { getGitContext } from '../context.ts'

export interface Branch {
  name: string
  current: boolean
  sha: string
  upstream: string | null
  subject: string
  ahead: number
  behind: number
  /** `true` when the upstream branch no longer exists. */
  gone: boolean
}

export interface GitBranches {
  isRepo: boolean
  current: string | null
  branches: Branch[]
}

const FORMAT = [
  '%(refname:short)',
  '%(objectname:short)',
  '%(HEAD)', // '*' on the checked-out branch, ' ' otherwise
  '%(upstream:short)',
  '%(upstream:track)', // e.g. "[ahead 2, behind 1]", "[gone]", or ""
  '%(contents:subject)',
].join(UNIT)

function parseTrack(track: string): { ahead: number, behind: number, gone: boolean } {
  if (track.includes('gone'))
    return { ahead: 0, behind: 0, gone: true }
  const ahead = track.match(/ahead (\d+)/)
  const behind = track.match(/behind (\d+)/)
  return {
    ahead: ahead ? Number(ahead[1]) : 0,
    behind: behind ? Number(behind[1]) : 0,
    gone: false,
  }
}

export const branches = defineRpcFunction({
  name: 'devframes:plugin:git:branches',
  type: 'query',
  snapshot: true,
  jsonSerializable: true,
  setup: (ctx) => {
    const git = getGitContext(ctx)
    return {
      handler: async (): Promise<GitBranches> => {
        const root = await git.resolveRoot()
        if (!root)
          return { isRepo: false, current: null, branches: [] }

        const raw = await tryGit(git.cwd, [
          'for-each-ref',
          `--format=${FORMAT}`,
          'refs/heads',
        ])
        if (!raw)
          return { isRepo: true, current: null, branches: [] }

        let current: string | null = null
        const branches: Branch[] = splitClean(raw, '\n').map((line) => {
          const [name, sha, head, upstream, track, subject] = line.split(UNIT)
          const isCurrent = head === '*'
          if (isCurrent)
            current = name
          return {
            name,
            current: isCurrent,
            sha,
            upstream: upstream || null,
            subject: subject ?? '',
            ...parseTrack(track ?? ''),
          }
        })

        // Surface the current branch first, then the rest in ref order.
        branches.sort((a, b) => Number(b.current) - Number(a.current))
        return { isRepo: true, current, branches }
      },
    }
  },
})
