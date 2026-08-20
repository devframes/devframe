import type {
  Branch,
  Commit,
  CommitDetail,
  CommitFile,
  DiffFile,
  FileStatusCode,
  GitBranches,
  GitFile,
  GitServiceApi,
  GitStatus,
  GitTags,
  StatusFileEntry,
  Tag,
} from './types'
import {
  gitErrorMessage,
  isSafeRevision,
  RECORD,
  resolveRepoRoot,
  runGit,
  splitClean,
  tryGit,
  UNIT,
} from './git'

/** Hard cap on returned patch text to keep payloads bounded. */
const PATCH_CHAR_LIMIT = 200_000

/** Hard cap on returned raw file content to keep payloads bounded. */
const FILE_CHAR_LIMIT = 500_000

// --- status ---------------------------------------------------------------

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
  canWrite: false,
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

      if (x !== '.')
        status.staged.push(from ? { path, from, status: mapCode(x) } : { path, status: mapCode(x) })
      if (y !== '.')
        status.unstaged.push({ path, status: mapCode(y) })
      continue
    }

    if (token.startsWith('u ')) {
      const path = token.split(' ').slice(10).join(' ')
      status.unstaged.push({ path, status: 'unmerged' } satisfies StatusFileEntry)
      continue
    }

    if (token.startsWith('? '))
      status.untracked.push(token.slice(2))
  }

  status.clean = status.staged.length === 0
    && status.unstaged.length === 0
    && status.untracked.length === 0
  return status
}

// --- log -------------------------------------------------------------------

const LOG_FORMAT = ['%H', '%h', '%P', '%an', '%ae', '%aI', '%D', '%s', '%b'].join(UNIT) + RECORD

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

// --- branches --------------------------------------------------------------

const BRANCH_FORMAT = [
  '%(refname:short)',
  '%(objectname:short)',
  '%(HEAD)',
  '%(upstream:short)',
  '%(upstream:track)',
  '%(contents:subject)',
].join(UNIT)

// --- tags ------------------------------------------------------------------

// `creatordate` so annotated tags report their own date (a naive
// `committerdate` is empty for annotated tags). `*objectname`/`*subject`
// dereference annotated tags to their target commit.
const TAG_FORMAT = [
  '%(refname:short)',
  '%(objecttype)',
  '%(objectname:short)',
  '%(*objectname:short)',
  '%(creatordate:iso-strict)',
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

// --- diff / show -----------------------------------------------------------

function parseNumstat(raw: string): DiffFile[] {
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

const SHOW_FORMAT = ['%H', '%h', '%P', '%an', '%ae', '%aI', '%cn', '%ce', '%cI', '%D', '%s', '%b'].join(UNIT)

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

function mapStatusCode(code: string): FileStatusCode {
  switch (code[0]) {
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

function parseNameStatus(raw: string): Map<string, FileStatusCode> {
  const map = new Map<string, FileStatusCode>()
  for (const line of splitClean(raw, '\n')) {
    const [code, ...paths] = line.split('\t')
    const path = paths[paths.length - 1]
    if (path)
      map.set(path, mapStatusCode(code))
  }
  return map
}

function parseCommitNumstat(raw: string, status: Map<string, FileStatusCode>): CommitFile[] {
  return splitClean(raw, '\n').map((line) => {
    const [add, del, ...rest] = line.split('\t')
    const binary = add === '-' || del === '-'
    const path = rest.join('\t')
    return {
      path,
      additions: binary ? 0 : Number(add),
      deletions: binary ? 0 : Number(del),
      binary,
      status: status.get(path) ?? 'modified',
    }
  })
}

function clipText(raw: string, limit: number): { text: string, truncated: boolean } {
  return raw.length > limit
    ? { text: raw.slice(0, limit), truncated: true }
    : { text: raw, truncated: false }
}

function clipPatch(raw: string): { patch: string, truncated: boolean } {
  const { text, truncated } = clipText(raw, PATCH_CHAR_LIMIT)
  return { patch: text, truncated }
}

// --- ops factory -----------------------------------------------------------

/**
 * Build the git node API bound to a single working directory, with the repo
 * root resolved once (memoized). This is the surface returned to in-process
 * consumers and wrapped by the service's RPC.
 */
export function createGitOps(cwd: string): GitServiceApi {
  let rootPromise: Promise<string | null> | undefined
  const resolveRoot = () => (rootPromise ??= resolveRepoRoot(cwd))

  async function status(): Promise<GitStatus> {
    const root = await resolveRoot()
    if (!root)
      return { ...EMPTY_STATUS }
    const { stdout } = await runGit(cwd, ['status', '--porcelain=v2', '--branch', '-z'])
    const result = parseStatus(root, stdout)
    result.canWrite = true
    return result
  }

  async function readCommit(hash: string, includePatch: boolean): Promise<CommitDetail> {
    if (!isSafeRevision(hash))
      return { ...EMPTY_DETAIL, isRepo: true }

    const meta = await tryGit(cwd, ['show', '-s', `--format=${SHOW_FORMAT}`, '--end-of-options', hash])
    if (meta == null)
      return { ...EMPTY_DETAIL, isRepo: true }

    const [fullHash, shortHash, parents, author, email, authorDate, committer, committerEmail, committerDate, refs, subject, body] = meta.split(UNIT)

    // `--root` so the initial commit reports its full tree as additions.
    const numstat = await tryGit(cwd, ['diff-tree', '--no-commit-id', '--numstat', '-r', '--root', '--end-of-options', hash])
    const nameStatusRaw = await tryGit(cwd, ['diff-tree', '--no-commit-id', '--name-status', '-r', '--root', '--end-of-options', hash])
    const files = numstat ? parseCommitNumstat(numstat, nameStatusRaw ? parseNameStatus(nameStatusRaw) : new Map()) : []

    let patch: string | null = null
    let truncated = false
    if (includePatch) {
      const raw = await tryGit(cwd, ['diff-tree', '-p', '--no-commit-id', '-r', '--root', '--end-of-options', hash])
      if (raw != null)
        ({ patch, truncated } = clipPatch(raw))
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
      totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
      totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
      patch,
      truncated,
    }
  }

  const api: GitServiceApi = {
    status,

    async log(args = {}) {
      const limit = clamp(Math.trunc(args.limit ?? 30), 1, 200)
      const skip = Math.max(0, Math.trunc(args.skip ?? 0))
      const ref = args.ref?.trim() || undefined
      const root = await resolveRoot()
      if (!root)
        return { isRepo: false, commits: [], limit, skip, hasMore: false }

      const command = ['log', '--topo-order', `--max-count=${limit}`, `--skip=${skip}`, `--pretty=format:${LOG_FORMAT}`]
      if (ref) {
        if (!isSafeRevision(ref))
          return { isRepo: true, commits: [], limit, skip, hasMore: false }
        command.push('--end-of-options', ref)
      }
      // Pathspec after `--` — everything past it is treated as a path, never
      // an option, so client paths need no dash guard here.
      const paths = (args.paths ?? []).map(p => p.trim()).filter(Boolean)
      if (paths.length > 0)
        command.push('--', ...paths)

      const raw = await tryGit(cwd, command)
      const commits = raw ? parseLog(raw) : []
      return { isRepo: true, commits, limit, skip, hasMore: commits.length === limit }
    },

    async show(args) {
      const hash = (args?.hash ?? '').trim()
      const includePatch = args?.patch ?? true
      const root = await resolveRoot()
      if (!root || !hash)
        return { ...EMPTY_DETAIL }
      return readCommit(hash, includePatch)
    },

    async readFile(args) {
      const path = (args?.path ?? '').trim()
      const ref = args?.ref?.trim() || 'HEAD'
      const root = await resolveRoot()
      const base: GitFile = { isRepo: !!root, found: false, ref, path, content: null, binary: false, truncated: false }
      if (!root || !path)
        return base
      // The spec is one `<ref>:<path>` token; guarding the ref against a
      // leading dash keeps the whole token from being read as an option.
      if (!isSafeRevision(ref))
        return base

      // `runGit` (not `tryGit`) preserves the blob's exact bytes, including a
      // trailing newline; a missing path exits non-zero and lands in `catch`.
      let raw: string
      try {
        ;({ stdout: raw } = await runGit(cwd, ['show', '--end-of-options', `${ref}:${path}`]))
      }
      catch {
        return base
      }
      // A NUL byte marks binary content — omit it rather than return garbage.
      if (raw.includes('\0'))
        return { ...base, found: true, binary: true }
      const { text: content, truncated } = clipText(raw, FILE_CHAR_LIMIT)
      return { ...base, found: true, content, truncated }
    },

    async diff(args = {}) {
      const { path, staged = false } = args
      const root = await resolveRoot()
      if (!root) {
        return { isRepo: false, staged, path: path ?? null, files: [], totalAdditions: 0, totalDeletions: 0, patch: null, truncated: false }
      }

      const base = staged ? ['diff', '--cached'] : ['diff']
      const scope = path ? ['--', path] : []
      const numstatRaw = await tryGit(cwd, [...base, '--numstat', ...scope])
      const files = numstatRaw ? parseNumstat(numstatRaw) : []

      let patch: string | null = null
      let truncated = false
      if (path) {
        const { stdout } = await runGit(cwd, [...base, ...scope])
        ;({ patch, truncated } = clipPatch(stdout))
      }

      return {
        isRepo: true,
        staged,
        path: path ?? null,
        files,
        totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
        totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
        patch,
        truncated,
      }
    },

    async branches(): Promise<GitBranches> {
      const root = await resolveRoot()
      if (!root)
        return { isRepo: false, current: null, branches: [] }

      const raw = await tryGit(cwd, ['for-each-ref', `--format=${BRANCH_FORMAT}`, 'refs/heads'])
      if (!raw)
        return { isRepo: true, current: null, branches: [] }

      let current: string | null = null
      const branches: Branch[] = splitClean(raw, '\n').map((line) => {
        const [name, sha, head, upstream, track, subject] = line.split(UNIT)
        const isCurrent = head === '*'
        if (isCurrent)
          current = name
        return { name, current: isCurrent, sha, upstream: upstream || null, subject: subject ?? '', ...parseTrack(track ?? '') }
      })
      branches.sort((a, b) => Number(b.current) - Number(a.current))
      return { isRepo: true, current, branches }
    },

    async tags(): Promise<GitTags> {
      const root = await resolveRoot()
      if (!root)
        return { isRepo: false, tags: [] }

      const raw = await tryGit(cwd, ['for-each-ref', `--format=${TAG_FORMAT}`, 'refs/tags'])
      if (!raw)
        return { isRepo: true, tags: [] }

      const tags: Tag[] = splitClean(raw, '\n').map((line) => {
        const [name, objectType, objectSha, targetSha, isoDate, subject] = line.split(UNIT)
        const annotated = objectType === 'tag'
        const parsed = Date.parse(isoDate)
        return {
          name,
          // Annotated tags dereference to their target commit; lightweight
          // tags point straight at it.
          sha: targetSha || objectSha,
          date: Number.isNaN(parsed) ? 0 : parsed,
          subject: subject ?? '',
          annotated,
        }
      })
      tags.sort((a, b) => b.date - a.date)
      return { isRepo: true, tags }
    },

    async stage(args) {
      const paths = args?.paths ?? []
      const root = await resolveRoot()
      if (root && paths.length > 0)
        await runGit(cwd, ['add', '--', ...paths])
      return status()
    },

    async unstage(args) {
      const paths = args?.paths ?? []
      const root = await resolveRoot()
      if (root && paths.length > 0)
        await runGit(cwd, ['restore', '--staged', '--', ...paths])
      return status()
    },

    async commit(args) {
      const message = (args?.message ?? '').trim()
      const root = await resolveRoot()
      if (!root)
        return { ok: false, hash: null, message: 'Not a git repository.', status: await status() }
      if (!message)
        return { ok: false, hash: null, message: 'Commit message is required.', status: await status() }
      try {
        await runGit(cwd, ['commit', '-m', message])
        const hash = await tryGit(cwd, ['rev-parse', '--short', 'HEAD'])
        return { ok: true, hash, message: 'Committed.', status: await status() }
      }
      catch (error) {
        return { ok: false, hash: null, message: gitErrorMessage(error), status: await status() }
      }
    },
  }

  return api
}
