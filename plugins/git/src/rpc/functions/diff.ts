import { defineRpcFunction } from 'devframe'
import { runGit, splitClean, tryGit } from '../../node/git.ts'
import { getGitContext } from '../context.ts'

/** Hard cap on the returned patch text to keep payloads bounded. */
const PATCH_CHAR_LIMIT = 200_000

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
  /** `true` when `patch` was clipped to {@link PATCH_CHAR_LIMIT}. */
  truncated: boolean
}

export interface DiffArgs {
  /** Limit the diff to a single path; omit for the whole tree. */
  path?: string
  /** Diff the index against HEAD instead of the working tree. */
  staged?: boolean
}

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

export const diff = defineRpcFunction({
  name: 'git:diff',
  type: 'query',
  snapshot: true,
  jsonSerializable: true,
  setup: (ctx) => {
    const git = getGitContext(ctx)
    return {
      handler: async (args: DiffArgs = {}): Promise<GitDiff> => {
        const { path, staged = false } = args
        const root = await git.resolveRoot()
        if (!root) {
          return {
            isRepo: false,
            staged,
            path: path ?? null,
            files: [],
            totalAdditions: 0,
            totalDeletions: 0,
            patch: null,
            truncated: false,
          }
        }

        const base = staged ? ['diff', '--cached'] : ['diff']
        const scope = path ? ['--', path] : []

        const numstatRaw = await tryGit(git.cwd, [...base, '--numstat', ...scope])
        const files = numstatRaw ? parseNumstat(numstatRaw) : []
        const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0)
        const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0)

        let patch: string | null = null
        let truncated = false
        if (path) {
          const { stdout } = await runGit(git.cwd, [...base, ...scope])
          if (stdout.length > PATCH_CHAR_LIMIT) {
            patch = stdout.slice(0, PATCH_CHAR_LIMIT)
            truncated = true
          }
          else {
            patch = stdout
          }
        }

        return {
          isRepo: true,
          staged,
          path: path ?? null,
          files,
          totalAdditions,
          totalDeletions,
          patch,
          truncated,
        }
      },
    }
  },
})
