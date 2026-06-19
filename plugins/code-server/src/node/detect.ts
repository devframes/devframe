import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import process from 'node:process'

export interface DetectCodeServerResult {
  installed: boolean
  version?: string
  bin: string
}

/**
 * Probe the host for a usable code-server binary by running
 * `<bin> --version`. Resolves to `installed: false` when the binary is
 * missing (ENOENT), errors, or exits non-zero — never throws — so the
 * launcher can fall back to install instructions.
 *
 * `code-server --version` prints e.g. `4.96.4 abc123 with Code 1.96.4`; the
 * leading token is taken as the version.
 */
export function detectCodeServer(bin = 'code-server', timeoutMs = 5000): Promise<DetectCodeServerResult> {
  return new Promise((resolve) => {
    let settled = false
    let stdout = ''

    const finish = (result: DetectCodeServerResult): void => {
      if (settled)
        return
      settled = true
      resolve(result)
    }

    let child
    try {
      child = spawn(bin, ['--version'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
        shell: process.platform === 'win32' && bin.endsWith('.cmd'),
      })
    }
    catch {
      finish({ installed: false, bin })
      return
    }

    const timer = setTimeout(() => {
      child.kill()
      finish({ installed: false, bin })
    }, timeoutMs)
    timer.unref?.()

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.on('error', () => {
      clearTimeout(timer)
      finish({ installed: false, bin })
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        const version = stdout.trim().split(/\s+/)[0] || undefined
        finish({ installed: true, version, bin })
      }
      else {
        finish({ installed: false, bin })
      }
    })
  })
}
