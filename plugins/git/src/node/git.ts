import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Field/record separators that never appear in git output we care about. */
export const UNIT = '\x1F'
export const RECORD = '\x1E'

const MAX_BUFFER = 1024 * 1024 * 64

export interface GitRunResult {
  stdout: string
  stderr: string
}

/**
 * Run a git command in `cwd`. Rejects when git exits non-zero — callers that
 * tolerate failure (e.g. "no upstream configured") should use {@link tryGit}.
 */
export async function runGit(cwd: string, args: string[]): Promise<GitRunResult> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
    // Force plain, locale-independent output so parsers stay stable.
    env: { ...process.env, GIT_PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
  })
  return { stdout, stderr }
}

/** Run a git command, returning trimmed stdout or `null` when it fails. */
export async function tryGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await runGit(cwd, args)
    return stdout.replace(/\n$/, '')
  }
  catch {
    return null
  }
}

/**
 * Client-supplied revisions must not start with `-`, which Git would parse as
 * an option before it treats the value as a revision.
 */
export function isSafeRevision(rev: string): boolean {
  return rev.length > 0 && !rev.startsWith('-')
}

/** Resolve the repository root for `cwd`, or `null` when `cwd` is outside a repo. */
export async function resolveRepoRoot(cwd: string): Promise<string | null> {
  return tryGit(cwd, ['rev-parse', '--show-toplevel'])
}

/** Split git output on a separator, dropping the trailing empty segment. */
export function splitClean(input: string, separator: string): string[] {
  return input.split(separator).filter(part => part.length > 0)
}

/**
 * Extract a concise, single-line message from a failed `execFile` error.
 * git writes useful text (e.g. "nothing to commit") to stdout/stderr.
 */
export function gitErrorMessage(error: unknown): string {
  const e = error as { stderr?: string, stdout?: string, message?: string }
  const text = (e?.stderr || e?.stdout || e?.message || 'git command failed').trim()
  return text.split('\n')[0]
}
