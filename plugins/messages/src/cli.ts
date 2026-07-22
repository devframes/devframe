import type { CacHandle } from 'devframe/adapters/cac'
import { createCac } from 'devframe/adapters/cac'
import messagesDevframe from './index'

/**
 * Build the standalone CLI for the messages panel — backs the package `bin`
 * (`devframe-messages`) and `pnpx @devframes/plugin-messages`. Wraps the
 * default {@link createMessagesDevframe} definition with devframe's
 * `dev` / `build` / `spa` / `mcp` command shell.
 */
export function createMessagesCli(): CacHandle {
  return createCac(messagesDevframe)
}
