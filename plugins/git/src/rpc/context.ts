import type { DevframeNodeContext } from 'devframe/types'
import { resolveRepoRoot } from '../node/git.ts'

export interface GitConfig {
  /** Directory the dashboard inspects. */
  cwd: string
  /** Whether staging / unstaging / committing actions are enabled. */
  write?: boolean
}

export interface GitContext {
  /** Directory the dashboard inspects. */
  readonly cwd: string
  /** Whether write actions (stage / unstage / commit) are enabled. */
  readonly write: boolean
  /**
   * Resolve the repository root, memoized for the lifetime of the context.
   * Resolves to `null` when `cwd` is not inside a git repository.
   */
  resolveRoot: () => Promise<string | null>
}

const configs = new WeakMap<DevframeNodeContext, GitConfig>()
const contexts = new WeakMap<DevframeNodeContext, GitContext>()

/**
 * Record the working directory for a context. Called from the devframe
 * `setup` before any RPC handler runs, so {@link getGitContext} can honor a
 * `repoRoot` override instead of the raw `ctx.cwd`.
 */
export function configureGit(ctx: DevframeNodeContext, config: GitConfig): void {
  configs.set(ctx, config)
}

/**
 * Per-`DevframeNodeContext` git state. Each RPC function file pulls its
 * working directory and (memoized) repo-root lookup from here instead of
 * re-resolving on every call.
 */
export function getGitContext(ctx: DevframeNodeContext): GitContext {
  let existing = contexts.get(ctx)
  if (existing)
    return existing

  const config = configs.get(ctx)
  const cwd = config?.cwd ?? ctx.cwd
  const write = config?.write ?? false
  let rootPromise: Promise<string | null> | undefined

  existing = {
    cwd,
    write,
    resolveRoot: () => {
      rootPromise ??= resolveRepoRoot(cwd)
      return rootPromise
    },
  }
  contexts.set(ctx, existing)
  return existing
}
