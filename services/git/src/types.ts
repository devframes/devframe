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
  /** `true` when stage / unstage / commit actions are available. */
  canWrite: boolean
}

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
  /** Restrict history to commits that touched these repo-relative path(s). */
  paths?: string[]
}

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

export interface Tag {
  name: string
  /** Short SHA of the commit the tag ultimately points to. */
  sha: string
  /**
   * Tag creation date as epoch milliseconds — the tag's own date for
   * annotated tags, the target commit's date for lightweight tags. `0` when
   * the date can't be parsed.
   */
  date: number
  /** Tag message subject (annotated) or target commit subject (lightweight). */
  subject: string
  /** `true` for annotated tags, which carry their own message and date. */
  annotated: boolean
}

export interface GitTags {
  isRepo: boolean
  /** Tags, newest creation date first. */
  tags: Tag[]
}

export interface ReadFileArgs {
  /** Repo-relative path to the file. */
  path: string
  /** Commit-ish to read the file from (default: current HEAD). */
  ref?: string
}

export interface GitFile {
  /** `false` when the working directory is not inside a git repository. */
  isRepo: boolean
  /** `false` when no blob exists at `path` for `ref`. */
  found: boolean
  /** The resolved ref the file was read from. */
  ref: string
  path: string
  /** File text, or `null` when not found or binary. */
  content: string | null
  /** `true` when the blob is binary (its `content` is omitted). */
  binary: boolean
  /** `true` when `content` was clipped to the internal char limit. */
  truncated: boolean
}

export interface DiffFile {
  path: string
  additions: number
  deletions: number
  binary: boolean
}

export interface GitDiff {
  isRepo: boolean
  staged: boolean
  path: string | null
  files: DiffFile[]
  totalAdditions: number
  totalDeletions: number
  /** Unified patch text — populated when `path` targets a single file. */
  patch: string | null
  /** `true` when `patch` was clipped to the internal char limit. */
  truncated: boolean
}

export interface DiffArgs {
  /** Limit the diff to a single path; omit for the whole tree. */
  path?: string
  /** Diff the index against HEAD instead of the working tree. */
  staged?: boolean
}

export interface CommitFile {
  path: string
  additions: number
  deletions: number
  binary: boolean
  /** Change kind relative to the parent (add / modify / delete / rename …). */
  status: FileStatusCode
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
  /** `true` when `patch` was clipped to the internal char limit. */
  truncated: boolean
}

export interface ShowArgs {
  /** Commit-ish to inspect (full or short hash). */
  hash: string
  /** Include the full unified patch (default `true`). */
  patch?: boolean
}

export interface StageArgs {
  /** Paths to stage (`git add`). */
  paths: string[]
}

export interface UnstageArgs {
  /** Paths to unstage (`git restore --staged`). */
  paths: string[]
}

export interface CommitArgs {
  /** Commit message. */
  message: string
}

export interface CommitResult {
  /** `true` when the commit succeeded. */
  ok: boolean
  /** Short hash of the new commit, or `null` on failure. */
  hash: string | null
  /** Human-readable outcome (e.g. "nothing to commit"). */
  message: string
  /** Working-tree status after the attempt. */
  status: GitStatus
}

/** The node API a consumer gets from `ctx.services.get('@devframes/service-git')`. */
export interface GitServiceApi {
  status: () => Promise<GitStatus>
  log: (args?: LogArgs) => Promise<GitLog>
  show: (args: ShowArgs) => Promise<CommitDetail>
  readFile: (args: ReadFileArgs) => Promise<GitFile>
  diff: (args?: DiffArgs) => Promise<GitDiff>
  branches: () => Promise<GitBranches>
  tags: () => Promise<GitTags>
  stage: (args: StageArgs) => Promise<GitStatus>
  unstage: (args: UnstageArgs) => Promise<GitStatus>
  commit: (args: CommitArgs) => Promise<CommitResult>
}
