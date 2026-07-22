import type { CacHandle } from 'devframe/adapters/cac'
import { createCac } from 'devframe/adapters/cac'
import inspectDevframe from './index'

/**
 * Build the standalone CLI for the inspector — backs the package `bin`
 * (`devframe-inspect`) and `pnpx @devframes/plugin-inspect`. Wraps the
 * default {@link createInspectDevframe} definition with devframe's
 * `dev` / `build` / `spa` / `mcp` command shell.
 */
export function createInspectCli(): CacHandle {
  return createCac(inspectDevframe)
}
