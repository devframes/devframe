import type { CacHandle } from 'devframe/adapters/cac'
import { createCac } from 'devframe/adapters/cac'
import a11yDevframe from './index.ts'

/**
 * Build the standalone CLI for the a11y inspector — backs the package `bin`
 * (`devframe-a11y-inspector`) and `npx @devframes/plugin-a11y`. Wraps the
 * default {@link createA11yDevframe} definition with devframe's
 * `dev` / `build` / `spa` command shell.
 */
export function createA11yCli(): CacHandle {
  return createCac(a11yDevframe)
}
