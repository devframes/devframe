import type { GitStatus } from './status.ts'
import { defineRpcFunction } from 'devframe'
import { runGit } from '../../node/git.ts'
import { getGitContext } from '../context.ts'
import { readStatus } from './status.ts'

export interface UnstageArgs {
  /** Paths to unstage (`git restore --staged`). */
  paths: string[]
}

export const unstage = defineRpcFunction({
  name: 'devframes:plugin:git:unstage',
  type: 'action',
  jsonSerializable: true,
  setup: (ctx) => {
    const git = getGitContext(ctx)
    return {
      handler: async (args: UnstageArgs): Promise<GitStatus> => {
        const paths = args?.paths ?? []
        const root = await git.resolveRoot()
        if (root && paths.length > 0)
          await runGit(git.cwd, ['restore', '--staged', '--', ...paths])
        return readStatus(git)
      },
    }
  },
})
