import type { CliHandle, CreateCliOptions } from 'devframe/adapters/cli'
import type { TerminalsOptions } from './types'
import { createCli } from 'devframe/adapters/cli'
import { createTerminalsDevframe } from './index'

/**
 * Build a standalone CLI for the terminals panel — `dev` / `build` / `mcp`
 * subcommands, backed by {@link createTerminalsDevframe}. Used by the
 * package `bin`.
 */
export function createTerminalsCli(
  options: TerminalsOptions = {},
  cliOptions: CreateCliOptions = {},
): CliHandle {
  return createCli(createTerminalsDevframe(options), cliOptions)
}
