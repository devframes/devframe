import type { Buffer } from 'node:buffer'
import type { Readable } from 'node:stream'
import process from 'node:process'
import { diagnostics } from './diagnostics'

/**
 * The default `onConfirm`: a `y/N` question in the terminal that runs the dev
 * server. Without an interactive terminal nobody can answer, so it refuses.
 */
export function confirmInTerminal(command: string[], input: Readable & { isTTY?: boolean } = process.stdin): Promise<boolean> {
  if (!input.isTTY) {
    diagnostics.DF9006({ command: command.join(' ') })
    return Promise.resolve(false)
  }
  diagnostics.DF9005({ command: command.join(' ') })
  // Vite reads the same stream for its shortcuts. Listen next to it, and
  // pause again only when nothing read the stream before.
  const flowing = input.readableFlowing
  return new Promise((resolve) => {
    input.once('data', (chunk: Buffer | string) => {
      if (!flowing)
        input.pause()
      resolve(/^y(?:es)?$/i.test(String(chunk).trim()))
    })
  })
}
