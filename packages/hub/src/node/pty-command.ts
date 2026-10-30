import { existsSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import process from 'node:process'

export interface PtyCommand {
  command: string
  args: string[]
}

export interface ResolvePtyCommandOptions {
  cwd: string
  env: Record<string, string | undefined>
  platform?: NodeJS.Platform
}

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD'
// Same set cross-spawn escapes for `cmd.exe`.
const CMD_META_CHARS = /[()[\]%!^"`<>&|;, *?]/g

export function resolvePtyCommand(
  command: string,
  args: string[],
  { cwd, env, platform = process.platform }: ResolvePtyCommandOptions,
): PtyCommand {
  if (platform !== 'win32')
    return { command, args }

  const comSpec = getEnv(env, 'ComSpec') || 'cmd.exe'
  if (isCmd(command, comSpec))
    return { command, args }

  const resolved = findExecutable(command, cwd, env)
  const ext = resolved ? extname(resolved).toLowerCase() : ''
  if (ext === '.exe' || ext === '.com')
    return { command, args }

  // `.cmd`/`.bat` shims re-parse their arguments
  // metachar need a second round of escaping to survive both passes
  const isBatch = ext === '.cmd' || ext === '.bat'
  // Known limit: a quoted command path plus a quoted argument makes `cmd /c`
  // strip the line's outer quotes. Pass shims by name (`vite`), not by path.
  return {
    command: comSpec,
    args: ['/d', '/c', escapeCmd(command, false), ...args.map(arg => escapeCmd(arg, isBatch))],
  }
}

function getEnv(env: ResolvePtyCommandOptions['env'], name: string): string | undefined {
  const key = Object.keys(env).findLast(key => key.toLowerCase() === name.toLowerCase())
  return key ? env[key] : undefined
}

function isCmd(command: string, comSpec: string): boolean {
  const name = command.toLowerCase()
  return name === comSpec.toLowerCase() || name === 'cmd' || name === 'cmd.exe'
}

function findExecutable(command: string, cwd: string, env: ResolvePtyCommandOptions['env']): string | undefined {
  // Windows paths ignore case; lower-case so the lookup also works on case-sensitive filesystems.
  const extensions = (getEnv(env, 'PATHEXT') || DEFAULT_PATHEXT).toLowerCase().split(';').filter(Boolean)
  const candidates = extname(command) ? [command, ...extensions.map(ext => command + ext)] : extensions.map(ext => command + ext)

  const searchCwd = getEnv(env, 'NoDefaultCurrentDirectoryInExePath') === undefined
  const dirs = /[\\/]/.test(command)
    ? [cwd]
    : [...(searchCwd ? [cwd] : []), ...(getEnv(env, 'PATH') || '').split(';').filter(Boolean)]
  for (const dir of dirs) {
    for (const candidate of candidates) {
      const file = resolve(dir, candidate)
      if (existsSync(file))
        return file
    }
  }
  return undefined
}

/**
 * Escape `cmd.exe` metacharacters in an argument zigpty passes unquoted.
 * zigpty double-quotes empty arguments and ones with a space, tab, quote or
 * backslash, and `cmd.exe` keeps quoted metacharacters literal, so those
 * are left alone - a `^` added there would reach the program as-is.
 */
function escapeCmd(arg: string, doubleEscape: boolean): string {
  if (!arg || /[ \t"\\]/.test(arg))
    return arg
  const escaped = arg.replace(CMD_META_CHARS, '^$&')
  return doubleEscape ? escaped.replace(CMD_META_CHARS, '^$&') : escaped
}
