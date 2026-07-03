import type { CliHandle } from 'devframe/adapters/cli'
import { createCli } from 'devframe/adapters/cli'
import messagesDevframe from './index'

/**
 * Build the standalone CLI for the messages panel — backs the package `bin`
 * (`devframe-messages`) and `npx @devframes/plugin-messages`. Wraps the
 * default {@link createMessagesDevframe} definition with devframe's
 * `dev` / `build` / `spa` / `mcp` command shell.
 */
export function createMessagesCli(): CliHandle {
  return createCli(messagesDevframe)
}
