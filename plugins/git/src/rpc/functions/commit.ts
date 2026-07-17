import type { GitStatus } from './status.ts'
import { defineRpcFunction } from 'devframe'
import { gitErrorMessage, runGit, tryGit } from '../../node/git.ts'
import { getGitContext } from '../context.ts'
import { readStatus } from './status.ts'

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

export const commit = defineRpcFunction({
  name: 'devframes:plugin:git:commit',
  type: 'action',
  jsonSerializable: true,
  setup: (ctx) => {
    const git = getGitContext(ctx)
    return {
      handler: async (args: CommitArgs): Promise<CommitResult> => {
        const message = (args?.message ?? '').trim()
        const root = await git.resolveRoot()
        if (!root)
          return { ok: false, hash: null, message: 'Not a git repository.', status: await readStatus(git) }
        if (!message)
          return { ok: false, hash: null, message: 'Commit message is required.', status: await readStatus(git) }

        try {
          await runGit(git.cwd, ['commit', '-m', message])
          const hash = await tryGit(git.cwd, ['rev-parse', '--short', 'HEAD'])
          return { ok: true, hash, message: 'Committed.', status: await readStatus(git) }
        }
        catch (error) {
          return { ok: false, hash: null, message: gitErrorMessage(error), status: await readStatus(git) }
        }
      },
    }
  },
})
