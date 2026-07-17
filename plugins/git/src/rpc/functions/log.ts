import { defineRpcFunction } from 'devframe'
import { isSafeRevision, RECORD, splitClean, tryGit, UNIT } from '../../node/git.ts'
import { getGitContext } from '../context.ts'

export interface Commit {
  hash: string
  shortHash: string
  author: string
  email: string
  /** Author date as epoch milliseconds. */
  date: number
  subject: string
  body: string
  /** Ref names pointing at this commit (branches, tags, HEAD). */
  refs: string[]
  /** Full parent hashes — drives the commit graph. */
  parents: string[]
}

export interface GitLog {
  isRepo: boolean
  commits: Commit[]
  limit: number
  skip: number
  /** `true` when the page filled to `limit`, hinting at further history. */
  hasMore: boolean
}

export interface LogArgs {
  /** Number of commits to return (clamped to 1–200, default 30). */
  limit?: number
  /** Commits to skip from the tip, for pagination (default 0). */
  skip?: number
  /** Optional ref/branch to read history from (default: current HEAD). */
  ref?: string
}

// Stable, parseable format: unit-separated fields, record-separated commits.
const FORMAT = [
  '%H', // full hash
  '%h', // short hash
  '%P', // parent hashes (space-separated)
  '%an', // author name
  '%ae', // author email
  '%aI', // author date, strict ISO 8601
  '%D', // ref names
  '%s', // subject
  '%b', // body
].join(UNIT) + RECORD

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function parseLog(raw: string): Commit[] {
  return splitClean(raw, RECORD).map((record) => {
    const [hash, shortHash, parents, author, email, isoDate, refs, subject, body] = record
      .replace(/^\n/, '')
      .split(UNIT)
    return {
      hash,
      shortHash,
      author,
      email,
      date: Date.parse(isoDate),
      subject,
      body: (body ?? '').trim(),
      refs: refs ? refs.split(', ').map(r => r.trim()).filter(Boolean) : [],
      parents: parents ? parents.split(' ').filter(Boolean) : [],
    }
  })
}

// Largest page git's handler will return (`limit` is clamped to 1–200). Static
// builds bake this many commits so the dashboard shows real history offline.
const SNAPSHOT_LIMIT = 200

export const log = defineRpcFunction({
  name: 'devframes:plugin:git:log',
  type: 'query',
  jsonSerializable: true,
  // A static build can't run git on demand, so bake the head of history (up to
  // `SNAPSHOT_LIMIT`) as the snapshot. Every client call resolves to this baked
  // page via the fallback; since a static bundle has no further page to fetch,
  // it reports `hasMore: false` so the UI shows everything it has in one shot.
  dump: async (_ctx, handler: (args?: LogArgs) => Promise<GitLog>) => {
    const output = await handler({ limit: SNAPSHOT_LIMIT, skip: 0 })
    const baked: GitLog = { ...output, hasMore: false }
    // `RETURN` carries the handler's `Promise<GitLog>`, while dump records hold
    // the already-resolved value — assert past that wrapper mismatch.
    return { records: [{ inputs: [], output: baked }], fallback: baked } as any
  },
  setup: (ctx) => {
    const git = getGitContext(ctx)
    return {
      handler: async (args: LogArgs = {}): Promise<GitLog> => {
        const limit = clamp(Math.trunc(args.limit ?? 30), 1, 200)
        const skip = Math.max(0, Math.trunc(args.skip ?? 0))
        const ref = args.ref?.trim() || undefined
        const root = await git.resolveRoot()
        if (!root)
          return { isRepo: false, commits: [], limit, skip, hasMore: false }

        const command = [
          'log',
          '--topo-order',
          `--max-count=${limit}`,
          `--skip=${skip}`,
          `--pretty=format:${FORMAT}`,
        ]
        if (ref) {
          if (!isSafeRevision(ref))
            return { isRepo: true, commits: [], limit, skip, hasMore: false }
          command.push('--end-of-options', ref)
        }

        const raw = await tryGit(git.cwd, command)
        // `null` happens on a repo with no commits yet — treat as empty.
        const commits = raw ? parseLog(raw) : []
        return { isRepo: true, commits, limit, skip, hasMore: commits.length === limit }
      },
    }
  },
})
