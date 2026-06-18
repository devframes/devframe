import type { DevframeDefinition } from 'devframe/types'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import { dirname, resolve } from 'pathe'
import { configureGit } from './rpc/context.ts'
import { serverFunctions } from './rpc/index.ts'

export type { Branch, GitBranches } from './rpc/functions/branches.ts'
export type { DiffArgs, DiffFile, GitDiff } from './rpc/functions/diff.ts'
export type { Commit, GitLog, LogArgs } from './rpc/functions/log.ts'
export type { FileStatusCode, GitStatus, StatusFileEntry } from './rpc/functions/status.ts'

// Package root, resolved one level up from this module — which sits at
// `<root>/src/index.ts` in dev and `<root>/dist/index.mjs` once built, so
// the bundled SPA is always `<root>/dist/client`.
const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

export interface GitDevframeOptions {
  /** Repository directory to inspect. Defaults to the devframe `cwd`. */
  repoRoot?: string
  /**
   * Mount path override. Left to the adapter by default: `/` for standalone
   * (cli / build / spa), `/__git/` for hosted (vite / embedded).
   */
  basePath?: string
  /** SPA dist directory. Defaults to the package's bundled SPA. */
  distDir?: string
  /** Preferred dev-server port (default 9710). */
  port?: number
}

/**
 * Create the Git dashboard devframe. Mount it into any host via devframe's
 * adapters, or run it standalone with the bundled CLI (`devframe-git`).
 */
export function createGitDevframe(options: GitDevframeOptions = {}): DevframeDefinition {
  const distDir = options.distDir ?? resolve(PKG_ROOT, 'dist/client')
  return defineDevframe({
    id: 'git',
    name: 'Git',
    icon: 'ph:git-branch-duotone',
    basePath: options.basePath,
    cli: {
      command: 'devframe-git',
      port: options.port ?? 9710,
      distDir,
      auth: false,
    },
    spa: { loader: 'none' },
    setup(ctx) {
      configureGit(ctx, { cwd: options.repoRoot ? resolve(options.repoRoot) : ctx.cwd })
      for (const fn of serverFunctions)
        ctx.rpc.register(fn)
    },
  })
}

export default createGitDevframe()
