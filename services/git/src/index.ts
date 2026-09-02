import type { DevframeServiceDefinition } from 'devframe/types'
import type {
  CommitArgs,
  CommitDetail,
  CommitResult,
  DiffArgs,
  GitBranches,
  GitDiff,
  GitFile,
  GitLog,
  GitServiceApi,
  GitStatus,
  GitTags,
  LogArgs,
  ReadFileArgs,
  ShowArgs,
  StageArgs,
  UnstageArgs,
} from './types'
import { defineRpcFunction } from 'devframe'
import { s } from 'devframe/utils/simple-schema'
import pkg from '../package.json' with { type: 'json' }
import { createGitOps } from './operations'

export * from './types'

export const GIT_SERVICE_PACKAGE = '@devframes/service-git'
export const GIT_SERVICE_SCOPE = 'devframes:service:git'

export interface GitServiceOptions {
  /**
   * Repository directory to operate on. Defaults to the context's `cwd`; the
   * repo root is discovered once (`rev-parse --show-toplevel`) and memoized.
   */
  cwd?: string
}

// --- return/arg schemas (read ops with args need a `returns` schema) --------

const commitSchema = s.object({
  hash: s.string(),
  shortHash: s.string(),
  author: s.string(),
  email: s.string(),
  date: s.number(),
  subject: s.string(),
  body: s.string(),
  refs: s.array(s.string()),
  parents: s.array(s.string()),
})

const gitLogSchema = s.object({
  isRepo: s.boolean(),
  commits: s.array(commitSchema),
  limit: s.number(),
  skip: s.number(),
  hasMore: s.boolean(),
})

const fileStatusCodeSchema = s.picklist([
  'modified',
  'added',
  'deleted',
  'renamed',
  'copied',
  'type-changed',
  'unmerged',
  'unknown',
])

const commitDetailSchema = s.object({
  isRepo: s.boolean(),
  found: s.boolean(),
  hash: s.string(),
  shortHash: s.string(),
  author: s.string(),
  email: s.string(),
  date: s.number(),
  committer: s.string(),
  committerEmail: s.string(),
  commitDate: s.number(),
  subject: s.string(),
  body: s.string(),
  parents: s.array(s.string()),
  refs: s.array(s.string()),
  files: s.array(s.object({
    path: s.string(),
    additions: s.number(),
    deletions: s.number(),
    binary: s.boolean(),
    status: fileStatusCodeSchema,
  })),
  totalAdditions: s.number(),
  totalDeletions: s.number(),
  patch: s.nullable(s.string()),
  truncated: s.boolean(),
})

const gitFileSchema = s.object({
  isRepo: s.boolean(),
  found: s.boolean(),
  ref: s.string(),
  path: s.string(),
  content: s.nullable(s.string()),
  binary: s.boolean(),
  truncated: s.boolean(),
})

const gitDiffSchema = s.object({
  isRepo: s.boolean(),
  staged: s.boolean(),
  path: s.nullable(s.string()),
  files: s.array(s.object({
    path: s.string(),
    additions: s.number(),
    deletions: s.number(),
    binary: s.boolean(),
  })),
  totalAdditions: s.number(),
  totalDeletions: s.number(),
  patch: s.nullable(s.string()),
  truncated: s.boolean(),
})

declare module 'devframe' {
  interface DevframeRpcServerFunctions {
    'devframes:service:git:status': () => Promise<GitStatus>
    'devframes:service:git:log': (args?: LogArgs) => Promise<GitLog>
    'devframes:service:git:show': (args: ShowArgs) => Promise<CommitDetail>
    'devframes:service:git:readFile': (args: ReadFileArgs) => Promise<GitFile>
    'devframes:service:git:diff': (args?: DiffArgs) => Promise<GitDiff>
    'devframes:service:git:branches': () => Promise<GitBranches>
    'devframes:service:git:tags': () => Promise<GitTags>
    'devframes:service:git:stage': (args: StageArgs) => Promise<GitStatus>
    'devframes:service:git:unstage': (args: UnstageArgs) => Promise<GitStatus>
    'devframes:service:git:commit': (args: CommitArgs) => Promise<CommitResult>
  }
  interface DevframeServicesRegistry {
    '@devframes/service-git': GitServiceApi
  }
  interface DevframeServicesScopeRegistry {
    '@devframes/service-git': 'devframes:service:git'
  }
}

/**
 * The git wire service: read/write git operations shared over RPC by every
 * plugin on the host, generalizing the utilities that used to live inside the
 * git plugin. The exec wrapper and output parsers stay internal; consumers get
 * the typed {@link GitServiceApi} in-process (`ctx.services.get`) and the same
 * ops over `devframes:service:git:*` RPC. Write ops are always exposed;
 * authorization is the host's connection-trust boundary. The service defines
 * no `dump`/`snapshot`; a devframe bakes what it needs via `snapshotRpc`.
 */
export function createGitService(options?: GitServiceOptions): DevframeServiceDefinition<GitServiceApi, GitServiceOptions> {
  return {
    package: GIT_SERVICE_PACKAGE,
    version: pkg.version,
    scope: GIT_SERVICE_SCOPE,
    options,
    /** `cwd` deep-merges as a scalar (later installer wins) across declarers. */
    setup(ctx, { options }) {
      const ops = createGitOps(options?.cwd ?? ctx.cwd)

      // Read ops.
      ctx.rpc.register(defineRpcFunction({
        name: 'status',
        type: 'query',
        jsonSerializable: true,
        agent: { title: 'Git status', description: 'Working-tree status of the inspected repository: current branch, ahead/behind counts, and every staged/unstaged/untracked file. Safe to call freely.' },
        handler: (): Promise<GitStatus> => ops.status(),
      }))
      ctx.rpc.register(defineRpcFunction({
        name: 'log',
        type: 'query',
        jsonSerializable: true,
        args: [s.object({ limit: s.optional(s.number()), skip: s.optional(s.number()), ref: s.optional(s.string()), paths: s.optional(s.array(s.string())) })],
        returns: gitLogSchema,
        agent: { title: 'Git log', description: 'Commit history of the inspected repository, newest first. Paginate with limit (1-200, default 30) and skip; pass ref to read another branch, or paths to list only commits that touched those files/directories. Safe to call freely.' },
        handler: (args: LogArgs = {}): Promise<GitLog> => ops.log(args),
      }))
      ctx.rpc.register(defineRpcFunction({
        name: 'show',
        type: 'query',
        jsonSerializable: true,
        args: [s.object({ hash: s.string(), patch: s.optional(s.boolean()) })],
        returns: commitDetailSchema,
        agent: { title: 'Git show', description: 'Full detail of one commit by hash: metadata, changed files, and the unified patch (pass patch: false to skip it for large commits). Safe to call freely.' },
        handler: (args: ShowArgs): Promise<CommitDetail> => ops.show(args),
      }))
      ctx.rpc.register(defineRpcFunction({
        name: 'readFile',
        type: 'query',
        jsonSerializable: true,
        args: [s.object({ path: s.string(), ref: s.optional(s.string()) })],
        returns: gitFileSchema,
        agent: { title: 'Git read file', description: 'Read the contents of a single file at a commit-ish (default HEAD): the raw text of a versioned file without checking it out. found is false when no such file exists at the ref; binary blobs return with content omitted. Safe to call freely.' },
        handler: (args: ReadFileArgs): Promise<GitFile> => ops.readFile(args),
      }))
      ctx.rpc.register(defineRpcFunction({
        name: 'diff',
        type: 'query',
        jsonSerializable: true,
        args: [s.object({ path: s.optional(s.string()), staged: s.optional(s.boolean()) })],
        returns: gitDiffSchema,
        agent: { title: 'Git diff', description: 'Unified diff of uncommitted changes: the working tree by default, the index with staged: true, one file with path. Safe to call freely.' },
        handler: (args: DiffArgs = {}): Promise<GitDiff> => ops.diff(args),
      }))
      ctx.rpc.register(defineRpcFunction({
        name: 'branches',
        type: 'query',
        jsonSerializable: true,
        agent: { title: 'Git branches', description: 'List local branches with tracking state (ahead/behind, gone upstreams) and the current branch. Safe to call freely.' },
        handler: (): Promise<GitBranches> => ops.branches(),
      }))
      ctx.rpc.register(defineRpcFunction({
        name: 'tags',
        type: 'query',
        jsonSerializable: true,
        agent: { title: 'Git tags', description: 'List tags (newest first) with the target commit SHA, creation date, and message subject; annotated tags are flagged. Safe to call freely.' },
        handler: (): Promise<GitTags> => ops.tags(),
      }))

      // Write ops (always registered; authorization is the host's concern).
      ctx.rpc.register(defineRpcFunction({
        name: 'stage',
        type: 'action',
        jsonSerializable: true,
        handler: (args: StageArgs): Promise<GitStatus> => ops.stage(args),
      }))
      ctx.rpc.register(defineRpcFunction({
        name: 'unstage',
        type: 'action',
        jsonSerializable: true,
        handler: (args: UnstageArgs): Promise<GitStatus> => ops.unstage(args),
      }))
      ctx.rpc.register(defineRpcFunction({
        name: 'commit',
        type: 'action',
        jsonSerializable: true,
        handler: (args: CommitArgs): Promise<CommitResult> => ops.commit(args),
      }))

      return ops
    },
  }
}

export default createGitService
