import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

export interface TempRepo {
  dir: string
  cleanup: () => void
}

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test User',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test User',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
  // Ignore the developer's global/system config so commits are deterministic.
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
}

function git(dir: string, args: string[]): void {
  execFileSync('git', args, { cwd: dir, stdio: 'pipe', env: GIT_ENV })
}

/** Run git with an overridden author/committer date, for deterministic tags. */
function gitAt(dir: string, args: string[], date: string): void {
  execFileSync('git', args, {
    cwd: dir,
    stdio: 'pipe',
    env: { ...GIT_ENV, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  })
}

function write(dir: string, file: string, content: string): void {
  writeFileSync(join(dir, file), content)
}

/**
 * Create a throwaway git repository with a known shape:
 *   - branch `main` with two commits, plus a `feature/x` branch.
 *   - one staged add (`staged.txt`), one unstaged modification (`README.md`),
 *     and one untracked file (`untracked.txt`).
 */
export function createTempRepo(): TempRepo {
  const dir = mkdtempSync(join(tmpdir(), 'devframe-git-'))
  git(dir, ['init', '-b', 'main'])
  git(dir, ['config', 'user.name', 'Test User'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'commit.gpgsign', 'false'])

  write(dir, 'README.md', '# Demo\n')
  git(dir, ['add', 'README.md'])
  git(dir, ['commit', '-m', 'init: add readme'])

  write(dir, 'a.txt', 'hello\n')
  git(dir, ['add', 'a.txt'])
  git(dir, ['commit', '-m', 'feat: add a.txt'])

  git(dir, ['branch', 'feature/x'])

  // Tags: a lightweight tag on the initial commit, and an annotated tag (with
  // its own, later tagger date) on HEAD — exercises `creatordate`, which
  // populates for annotated tags where `committerdate` would be empty.
  git(dir, ['tag', 'v0.0.1', 'HEAD~1'])
  gitAt(dir, ['tag', '-a', 'v1.0.0', '-m', 'release one'], '2021-06-01T00:00:00Z')

  // Working-tree state for status/diff assertions.
  write(dir, 'README.md', '# Demo\nmore\n') // unstaged modification
  write(dir, 'staged.txt', 'staged content\n')
  git(dir, ['add', 'staged.txt']) // staged add
  write(dir, 'untracked.txt', 'untracked\n') // untracked

  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

/**
 * Create a repo whose commits touch distinct paths, for path-scoped log:
 *   1. `feat: src a`  — adds `src/a.ts`
 *   2. `docs: b`      — adds `docs/b.md`
 *   3. `fix: src a`   — modifies `src/a.ts`
 */
export function createPathRepo(): TempRepo {
  const dir = mkdtempSync(join(tmpdir(), 'devframe-git-paths-'))
  git(dir, ['init', '-b', 'main'])
  git(dir, ['config', 'user.name', 'Test User'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'commit.gpgsign', 'false'])

  mkdirSync(join(dir, 'src'), { recursive: true })
  mkdirSync(join(dir, 'docs'), { recursive: true })

  write(dir, 'src/a.ts', 'export const a = 1\n')
  git(dir, ['add', 'src/a.ts'])
  git(dir, ['commit', '-m', 'feat: src a'])

  write(dir, 'docs/b.md', '# B\n')
  git(dir, ['add', 'docs/b.md'])
  git(dir, ['commit', '-m', 'docs: b'])

  write(dir, 'src/a.ts', 'export const a = 2\n')
  git(dir, ['add', 'src/a.ts'])
  git(dir, ['commit', '-m', 'fix: src a'])

  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

/** Create an empty (non-git) temp directory. */
export function createTempDir(): TempRepo {
  const dir = mkdtempSync(join(tmpdir(), 'devframe-git-bare-'))
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}
