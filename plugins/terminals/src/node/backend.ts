import type { Buffer } from 'node:buffer'
import type { TerminalBackend } from '../types'
import { spawn as spawnChild } from 'node:child_process'
import { diagnostics } from './diagnostics'

/**
 * Minimal surface the manager needs from a running terminal process,
 * abstracting over a real PTY and a piped child process. Kept local so the
 * plugin's public types never hard-depend on the optional native module.
 */
export interface TerminalProcess {
  readonly pid: number | undefined
  readonly backend: TerminalBackend
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: (signal?: string) => void
  onData: (cb: (data: string) => void) => void
  onExit: (cb: (exitCode: number) => void) => void
  /**
   * Current foreground process name of the controlling TTY, when the
   * backend can resolve it (PTY only). Polled by the manager.
   */
  getProcessName?: () => string | undefined
}

export interface SpawnBackendOptions {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  cols: number
  rows: number
  /** When true, stdin is wired (interactive). Readonly sessions leave it closed. */
  input: boolean
}

interface PtyModule {
  spawn: (file: string, args: string[], options: {
    name?: string
    cols?: number
    rows?: number
    cwd?: string
    env?: Record<string, string>
  }) => PtyProcess
}

interface PtyProcess {
  pid: number
  /** Foreground process title; updated by node-pty as the foreground changes. */
  readonly process?: string
  onData: (cb: (data: string) => void) => void
  onExit: (cb: (e: { exitCode: number, signal?: number }) => void) => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: (signal?: string) => void
}

/** TERM name handed to the PTY; also used to reject the Windows fallback. */
const PTY_TERM_NAME = 'xterm-256color'

let ptyModulePromise: Promise<PtyModule | undefined> | undefined

/**
 * Lazily load the optional PTY backend. Resolves to `undefined` when the
 * native module is missing or fails to load, letting interactive sessions
 * degrade to a piped child process.
 */
async function loadPty(): Promise<PtyModule | undefined> {
  ptyModulePromise ??= (async () => {
    try {
      const mod = await import('@homebridge/node-pty-prebuilt-multiarch')
      const candidate = ((mod as any).default ?? mod) as PtyModule
      return typeof candidate?.spawn === 'function' ? candidate : undefined
    }
    catch {
      return undefined
    }
  })()
  return ptyModulePromise
}

/** Whether the PTY backend is available in this runtime. */
export async function isPtyAvailable(): Promise<boolean> {
  return (await loadPty()) !== undefined
}

/** Spawn a real PTY. Returns `undefined` when the backend is unavailable. */
export async function spawnPty(options: SpawnBackendOptions): Promise<TerminalProcess | undefined> {
  const pty = await loadPty()
  if (!pty)
    return undefined

  let proc: PtyProcess
  try {
    proc = pty.spawn(options.command, options.args, {
      name: PTY_TERM_NAME,
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: options.env,
    })
  }
  catch (error) {
    diagnostics.DP_TERMINALS_0004(
      { command: options.command, reason: error instanceof Error ? error.message : String(error) },
      { method: 'warn' },
    )
    return undefined
  }

  return {
    backend: 'pty',
    get pid() { return proc.pid },
    write: (data) => {
      try {
        proc.write(data)
      }
      catch {
        // Process already gone.
      }
    },
    resize: (cols, rows) => {
      try {
        proc.resize(Math.max(1, cols), Math.max(1, rows))
      }
      catch {
        // Resize after exit is a no-op.
      }
    },
    kill: (signal) => {
      try {
        proc.kill(signal)
      }
      catch {
        // Already dead.
      }
    },
    onData: cb => proc.onData(cb),
    onExit: cb => proc.onExit(e => cb(e.exitCode ?? 0)),
    getProcessName: () => {
      try {
        const name = proc.process
        // On Windows node-pty falls back to the TERM name rather than the
        // foreground process — don't surface that as a session label.
        return name && name !== PTY_TERM_NAME ? name : undefined
      }
      catch {
        return undefined
      }
    },
  }
}

/**
 * Spawn a piped child process. Used for readonly sessions and as the
 * interactive fallback when no PTY backend is present. stdout/stderr are
 * merged into a single ordered text stream.
 */
export function spawnPipe(options: SpawnBackendOptions): TerminalProcess {
  const dataCbs: ((data: string) => void)[] = []
  const exitCbs: ((code: number) => void)[] = []
  let exited = false

  const emitData = (data: string): void => {
    for (const cb of dataCbs) cb(data)
  }
  const emitExit = (code: number): void => {
    if (exited)
      return
    exited = true
    for (const cb of exitCbs) cb(code)
  }

  const child = spawnChild(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: [options.input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  child.stdout?.on('data', (chunk: Buffer) => emitData(chunk.toString('utf8')))
  child.stderr?.on('data', (chunk: Buffer) => emitData(chunk.toString('utf8')))
  child.on('error', (error) => {
    emitData(`\r\n[failed to start: ${error.message}]\r\n`)
    emitExit(1)
  })
  child.on('exit', code => emitExit(code ?? 0))

  return {
    backend: 'pipe',
    get pid() { return child.pid },
    write: (data) => {
      if (options.input && child.stdin && !child.stdin.destroyed)
        child.stdin.write(data)
    },
    resize: () => {
      // A piped child has no controlling TTY to resize.
    },
    kill: (signal) => {
      try {
        child.kill((signal as NodeJS.Signals) ?? 'SIGTERM')
      }
      catch {
        // Already dead.
      }
    },
    onData: cb => dataCbs.push(cb),
    onExit: cb => exitCbs.push(cb),
  }
}

/**
 * Spawn the most capable backend for the requested interaction. Interactive
 * sessions prefer a real PTY (for TUIs); readonly sessions and the no-PTY
 * fallback use a piped child process.
 */
export async function spawnBackend(
  options: SpawnBackendOptions,
  preferPty: boolean,
): Promise<TerminalProcess> {
  if (preferPty) {
    const pty = await spawnPty(options)
    if (pty)
      return pty
    diagnostics.DP_TERMINALS_0005({}, { method: 'warn' })
  }
  return spawnPipe(options)
}
