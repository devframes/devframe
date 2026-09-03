import { spawn } from 'node:child_process'
import fs from 'node:fs'
import process from 'node:process'

/**
 * Launches `command` detached from the current process and resolves once
 * the OS has accepted the spawn (not once the launched app exits), the
 * same "fire and forget" behavior `open`'s default (`wait: false`) gave us.
 */
function spawnDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

function isWsl(): boolean {
  if (process.platform !== 'linux')
    return false
  try {
    return fs.readFileSync('/proc/version', 'utf-8').toLowerCase().includes('microsoft')
  }
  catch {
    return false
  }
}

/**
 * Open a URL, file, or other target in its default OS handler
 * (browser for URLs, Finder/Explorer for paths, etc.).
 */
export async function open(target: string): Promise<void> {
  if (process.platform === 'darwin')
    return spawnDetached('open', [target])

  if (process.platform === 'win32') {
    // `start` is a cmd.exe builtin; the empty title argument keeps `target`
    // from being mistaken for a window title when it's itself quoted.
    return spawnDetached('cmd', ['/c', 'start', '""', target])
  }

  if (isWsl()) {
    // `wslview` (from wslu) hands the target to the Windows shell the same
    // way an interactive user would; fall back to invoking `cmd.exe`
    // directly on WSL distros that don't have wslu installed.
    try {
      return await spawnDetached('wslview', [target])
    }
    catch {
      return spawnDetached('cmd.exe', ['/c', 'start', '""', target])
    }
  }

  return spawnDetached('xdg-open', [target])
}
