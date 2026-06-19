import type { CliHandle, CreateCliOptions } from 'devframe/adapters/cli'
import type { CodeServerOptions } from './types'
import { createCli } from 'devframe/adapters/cli'
import { createCodeServerDevframe } from './index'

/**
 * Build a standalone CLI for the code-server panel — `dev` / `build` / `mcp`
 * subcommands, backed by {@link createCodeServerDevframe}. Used by the package
 * `bin` (`devframe-code-server`).
 */
export function createCodeServerCli(
  options: CodeServerOptions = {},
  cliOptions: CreateCliOptions = {},
): CliHandle {
  return createCli(createCodeServerDevframe(options), cliOptions)
}
