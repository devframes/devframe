import type { GitStatus } from './status.ts'
import { defineRpcFunction } from 'devframe'
import { runGit } from '../../node/git.ts'
import { getGitContext } from '../context.ts'
import { readStatus } from './status.ts'

export interface StageArgs {
  /** Paths to stage (`git add`). */
  paths: string[]
}

export const stage = defineRpcFunction({
  name: 'git:stage',
  type: 'action',
  jsonSerializable: true,
  setup: (ctx) => {
    const git = getGitContext(ctx)
    return {
      handler: async (args: StageArgs): Promise<GitStatus> => {
        const paths = args?.paths ?? []
        const root = await git.resolveRoot()
        if (root && paths.length > 0)
          await runGit(git.cwd, ['add', '--', ...paths])
        return readStatus(git)
      },
    }
  },
})
