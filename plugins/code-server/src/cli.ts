import type { CacHandle, CreateCacOptions } from 'devframe/adapters/cac'
import type { CodeServerOptions } from './types'
import { createCac } from 'devframe/adapters/cac'
import { createCodeServerDevframe } from './index'

/**
 * Build a standalone CLI for the code-server panel — `dev` / `build` / `mcp`
 * subcommands, backed by {@link createCodeServerDevframe}. Used by the package
 * `bin` (`devframe-code-server`).
 */
export function createCodeServerCli(
  options: CodeServerOptions = {},
  cliOptions: CreateCacOptions = {},
): CacHandle {
  return createCac(createCodeServerDevframe(options), cliOptions)
}
