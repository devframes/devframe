import type { DevframeDefinition } from 'devframe/types'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import { dirname, resolve } from 'pathe'
import { configureGit } from './rpc/context.ts'
import { readFunctions, writeFunctions } from './rpc/index.ts'

export type { Branch, GitBranches } from './rpc/functions/branches.ts'
export type { CommitArgs, CommitResult } from './rpc/functions/commit.ts'
export type { DiffArgs, DiffFile, GitDiff } from './rpc/functions/diff.ts'
export type { Commit, GitLog, LogArgs } from './rpc/functions/log.ts'
export type { CommitDetail, CommitFile, ShowArgs } from './rpc/functions/show.ts'
export type { StageArgs } from './rpc/functions/stage.ts'
export type { FileStatusCode, GitStatus, StatusFileEntry } from './rpc/functions/status.ts'
export type { UnstageArgs } from './rpc/functions/unstage.ts'

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
  /**
   * Enable staging, unstaging, and committing from the UI. Read-only by
   * default; the standalone CLI also accepts a `--write` flag.
   */
  write?: boolean
}

/**
 * Create the Git dashboard devframe. Mount it into any host via devframe's
 * adapters, or run it standalone with the bundled CLI (`devframe-git`).
 *
 * @experimental This plugin is experimental and may change without a major
 * version bump until it stabilizes.
 */
export function createGitDevframe(options: GitDevframeOptions = {}): DevframeDefinition {
  const distDir = options.distDir ?? resolve(PKG_ROOT, 'dist/client')
  return defineDevframe({
    id: 'git',
    name: 'Git',
    version: '0.5.2',
    packageName: '@devframes/plugin-git',
    homepage: 'https://github.com/devframes/devframe/tree/main/plugins/git#readme',
    description: 'Git dashboard for devframe',
    icon: 'ph:git-branch-duotone',
    basePath: options.basePath,
    cli: {
      command: 'devframe-git',
      port: options.port ?? 9710,
      distDir,
      auth: false,
      configure(cli) {
        cli.option('--write', 'Enable staging, unstaging, and committing from the UI')
      },
    },
    spa: { loader: 'none' },
    setup(ctx, info) {
      const write = options.write ?? info?.flags?.write === true
      configureGit(ctx, {
        cwd: options.repoRoot ? resolve(options.repoRoot) : ctx.cwd,
        write,
      })
      for (const fn of readFunctions)
        ctx.rpc.register(fn)
      if (write) {
        for (const fn of writeFunctions)
          ctx.rpc.register(fn)
      }
    },
  })
}

export default createGitDevframe()
