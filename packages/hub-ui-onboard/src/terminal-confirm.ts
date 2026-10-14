import type { Buffer } from 'node:buffer'
import type { Readable } from 'node:stream'
import process from 'node:process'
import { diagnostics } from './diagnostics'

const ANSWER_MINUTES = 5

/**
 * The default `onConfirm`: a `y/N` question in the terminal that runs the dev
 * server. When nobody can answer it, it refuses.
 */
export function confirmInTerminal(command: string[], input: Readable & { isTTY?: boolean, isRaw?: boolean } = process.stdin): Promise<boolean> {
  const line = command.join(' ')
  if (!input.isTTY) {
    diagnostics.DF9006({ command: line })
    return Promise.resolve(false)
  }
  // Raw mode means a TUI (nuxi's) takes each key as a shortcut and hides the
  // question in its log view. The next key would answer a question nobody saw.
  if (input.isRaw) {
    diagnostics.DF9007({ command: line })
    return Promise.resolve(false)
  }
  diagnostics.DF9005({ command: line, minutes: ANSWER_MINUTES })
  // Vite reads the same stream for its shortcuts. Listen next to it, and
  // pause again only when nothing read the stream before.
  const flowing = input.readableFlowing
  return new Promise((resolve) => {
    // Another process can read the same terminal first (nuxi's plain mode
    // after a restart), so the answer may never reach this stream.
    const timer = setTimeout(() => {
      diagnostics.DF9008({ command: line, minutes: ANSWER_MINUTES })
      settle(false)
    }, ANSWER_MINUTES * 60_000)
    const onData = (chunk: Buffer | string) => settle(/^y(?:es)?$/i.test(String(chunk).trim()))
    function settle(allowed: boolean): void {
      clearTimeout(timer)
      input.off('data', onData)
      if (!flowing)
        input.pause()
      resolve(allowed)
    }
    input.on('data', onData)
  })
}
