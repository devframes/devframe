import type { CacHandle, CreateCacOptions } from 'devframe/adapters/cac'
import type { TerminalsOptions } from './types'
import { createCac } from 'devframe/adapters/cac'
import { createTerminalsDevframe } from './index'

/**
 * Build a standalone CLI for the terminals panel — `dev` / `build` / `mcp`
 * subcommands, backed by {@link createTerminalsDevframe}. Used by the
 * package `bin`.
 */
export function createTerminalsCli(
  options: TerminalsOptions = {},
  cliOptions: CreateCacOptions = {},
): CacHandle {
  return createCac(createTerminalsDevframe(options), cliOptions)
}
