import type { GitContext } from '../context.ts'
import { defineRpcFunction } from 'devframe'
import { isSafeRevision, splitClean, tryGit, UNIT } from '../../node/git.ts'
import { getGitContext } from '../context.ts'

/** Hard cap on the returned patch text to keep payloads bounded. */
const PATCH_CHAR_LIMIT = 200_000

/** Matches the window `git:log` bakes, so any visible commit has a snapshot. */
const SNAPSHOT_LIMIT = 200

/** Read-only git detail work can run in parallel without overwhelming builds. */
const DUMP_CONCURRENCY = 8

export interface CommitFile {
  path: string
  additions: number
  deletions: number
  binary: boolean
}

export interface CommitDetail {
  /** `false` when the working directory is not inside a git repository. */
  isRepo: boolean
  /** `false` when the hash does not resolve to a commit. */
  found: boolean
  hash: string
  shortHash: string
  author: string
  email: string
  /** Author date as epoch milliseconds. */
  date: number
  committer: string
  committerEmail: string
  /** Commit date as epoch milliseconds. */
  commitDate: number
  subject: string
  body: string
  parents: string[]
  refs: string[]
  files: CommitFile[]
  totalAdditions: number
  totalDeletions: number
  /** Unified patch text for the commit, or `null` when omitted/unavailable. */
  patch: string | null
  /** `true` when `patch` was clipped to {@link PATCH_CHAR_LIMIT}. */
  truncated: boolean
}

export interface ShowArgs {
  /** Commit-ish to inspect (full or short hash). */
  hash: string
  /** Include the full unified patch (default `true`). */
  patch?: boolean
}

const EMPTY_DETAIL: CommitDetail = {
  isRepo: false,
  found: false,
  hash: '',
  shortHash: '',
  author: '',
  email: '',
  date: 0,
  committer: '',
  committerEmail: '',
  commitDate: 0,
  subject: '',
  body: '',
  parents: [],
  refs: [],
  files: [],
  totalAdditions: 0,
  totalDeletions: 0,
  patch: null,
  truncated: false,
}

const SHOW_FORMAT = [
  '%H', // full hash
  '%h', // short hash
  '%P', // parent hashes
  '%an', // author name
  '%ae', // author email
  '%aI', // author date, ISO 8601
  '%cn', // committer name
  '%ce', // committer email
  '%cI', // committer date, ISO 8601
  '%D', // ref names
  '%s', // subject
  '%b', // body
].join(UNIT)

function parseNumstat(raw: string): CommitFile[] {
  return splitClean(raw, '\n').map((line) => {
    const [add, del, ...rest] = line.split('\t')
    const binary = add === '-' || del === '-'
    return {
      path: rest.join('\t'),
      additions: binary ? 0 : Number(add),
      deletions: binary ? 0 : Number(del),
      binary,
    }
  })
}

async function readCommit(git: GitContext, hash: string, includePatch: boolean): Promise<CommitDetail> {
  if (!isSafeRevision(hash))
    return { ...EMPTY_DETAIL, isRepo: true }

  const meta = await tryGit(git.cwd, ['show', '-s', `--format=${SHOW_FORMAT}`, '--end-of-options', hash])
  if (meta == null)
    return { ...EMPTY_DETAIL, isRepo: true }

  const [
    fullHash,
    shortHash,
    parents,
    author,
    email,
    authorDate,
    committer,
    committerEmail,
    committerDate,
    refs,
    subject,
    body,
  ] = meta.split(UNIT)

  // `--root` so the initial commit reports its full tree as additions.
  const numstat = await tryGit(git.cwd, ['diff-tree', '--no-commit-id', '--numstat', '-r', '--root', '--end-of-options', hash])
  const files = numstat ? parseNumstat(numstat) : []
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0)
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0)

  let patch: string | null = null
  let truncated = false
  if (includePatch) {
    const raw = await tryGit(git.cwd, ['diff-tree', '-p', '--no-commit-id', '-r', '--root', '--end-of-options', hash])
    if (raw != null) {
      if (raw.length > PATCH_CHAR_LIMIT) {
        patch = raw.slice(0, PATCH_CHAR_LIMIT)
        truncated = true
      }
      else {
        patch = raw
      }
    }
  }

  return {
    isRepo: true,
    found: true,
    hash: fullHash,
    shortHash,
    author,
    email,
    date: Date.parse(authorDate),
    committer,
    committerEmail,
    commitDate: Date.parse(committerDate),
    subject,
    body: (body ?? '').trim(),
    parents: parents ? parents.split(' ').filter(Boolean) : [],
    refs: refs ? refs.split(', ').map(r => r.trim()).filter(Boolean) : [],
    files,
    totalAdditions,
    totalDeletions,
    patch,
    truncated,
  }
}

export const show = defineRpcFunction({
  name: 'git:show',
  type: 'query',
  jsonSerializable: true,
  // Static builds can't run git per click, so bake one record per commit in the
  // same window `git:log` snapshots. Patches are omitted from the baked records
  // to keep the bundle bounded — static detail panels show metadata + files.
  dump: async (ctx, _handler: (args: ShowArgs) => Promise<CommitDetail>) => {
    const git = getGitContext(ctx)
    const root = await git.resolveRoot()
    if (!root)
      return { records: [], fallback: EMPTY_DETAIL } as any

    const raw = await tryGit(git.cwd, [
      'log',
      '--topo-order',
      `--max-count=${SNAPSHOT_LIMIT}`,
      '--pretty=format:%H',
    ])
    const hashes = raw ? raw.split('\n').filter(Boolean) : []

    const records: { inputs: [{ hash: string }], output: CommitDetail }[] = []
    for (let i = 0; i < hashes.length; i += DUMP_CONCURRENCY) {
      const batch = hashes.slice(i, i + DUMP_CONCURRENCY)
      const outputs = await Promise.all(batch.map(hash => readCommit(git, hash, false)))
      batch.forEach((hash, index) => {
        records.push({ inputs: [{ hash }], output: outputs[index] })
      })
    }

    const fallback = records[0]?.output ?? { ...EMPTY_DETAIL, isRepo: true }
    return { records, fallback } as any
  },
  setup: (ctx) => {
    const git = getGitContext(ctx)
    return {
      handler: async (args: ShowArgs): Promise<CommitDetail> => {
        const hash = (args?.hash ?? '').trim()
        const includePatch = args?.patch ?? true
        const root = await git.resolveRoot()
        if (!root || !hash)
          return EMPTY_DETAIL
        return readCommit(git, hash, includePatch)
      },
    }
  },
})
