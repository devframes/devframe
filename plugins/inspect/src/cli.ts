import type { CliHandle } from 'devframe/adapters/cli'
import { createCli } from 'devframe/adapters/cli'
import inspectDevframe from './index'

/**
 * Build the standalone CLI for the inspector — backs the package `bin`
 * (`devframe-inspect`) and `npx @devframes/plugin-inspect`. Wraps the
 * default {@link createInspectDevframe} definition with devframe's
 * `dev` / `build` / `spa` / `mcp` command shell.
 */
export function createInspectCli(): CliHandle {
  return createCli(inspectDevframe)
}
