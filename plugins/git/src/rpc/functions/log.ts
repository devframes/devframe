import { defineRpcFunction } from 'devframe'
import { RECORD, splitClean, tryGit, UNIT } from '../../node/git.ts'
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
}

// Stable, parseable format: unit-separated fields, record-separated commits.
const FORMAT = [
  '%H', // full hash
  '%h', // short hash
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
    const [hash, shortHash, author, email, isoDate, refs, subject, body] = record
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
    }
  })
}

export const log = defineRpcFunction({
  name: 'git:log',
  type: 'query',
  snapshot: true,
  jsonSerializable: true,
  setup: (ctx) => {
    const git = getGitContext(ctx)
    return {
      handler: async (args: LogArgs = {}): Promise<GitLog> => {
        const limit = clamp(Math.trunc(args.limit ?? 30), 1, 200)
        const skip = Math.max(0, Math.trunc(args.skip ?? 0))
        const root = await git.resolveRoot()
        if (!root)
          return { isRepo: false, commits: [], limit, skip, hasMore: false }

        const raw = await tryGit(git.cwd, [
          'log',
          `--max-count=${limit}`,
          `--skip=${skip}`,
          `--pretty=format:${FORMAT}`,
        ])
        // `null` happens on a repo with no commits yet — treat as empty.
        const commits = raw ? parseLog(raw) : []
        return { isRepo: true, commits, limit, skip, hasMore: commits.length === limit }
      },
    }
  },
})
