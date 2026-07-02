import type { DevframeNodeContext } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import type {
  CodeServerAuth,
  CodeServerDetection,
  CodeServerOptions,
  CodeServerServerInfo,
  CodeServerSharedState,
  CodeServerStartRequest,
  CodeServerStartResult,
  CodeServerStatusResult,
} from '../types'
import { execSync, spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import process from 'node:process'
import { getPort } from 'get-port-please'
import {
  DEFAULT_CODE_SERVER_PORT,
  DEFAULT_START_TIMEOUT,
  getCookieSessionName,
  PLUGIN_ID,
  STATE_KEY,
  TERMINAL_SESSION_ICON,
  TERMINAL_SESSION_TITLE,
} from '../constants'
import { detectCodeServer } from './detect'
import { diagnostics } from './diagnostics'

/** Recent output lines retained for surfacing startup failures. */
const LOG_BUFFER_LINES = 200
/** Interval between readiness probes. */
const PROBE_INTERVAL = 250

/**
 * Minimal shape of the hub's terminals subsystem (`DevframeHubContext.terminals`).
 * Declared locally and accessed by duck-typing so the plugin keeps no build- or
 * runtime dependency on `@devframes/hub` and behaves identically standalone,
 * where `ctx.terminals` is simply absent. Mirrors the pattern used by the
 * terminals plugin.
 */
interface HubTerminalEntry {
  id: string
  title: string
  description?: string
  status: 'running' | 'stopped' | 'error'
  icon?: string
}
interface HubChildProcessSession extends HubTerminalEntry {
  getChildProcess: () => ChildProcess | undefined
  terminate: () => Promise<void>
  restart: () => Promise<void>
}
interface HubTerminalsBridge {
  sessions: Map<string, { id: string }>
  update: (patch: Partial<HubTerminalEntry> & { id: string }) => void
  remove?: (session: { id: string }) => void
  startChildProcess: (
    executeOptions: { command: string, args: string[], cwd?: string, env?: Record<string, string> },
    terminal: { id: string, title: string, description?: string, icon?: string },
  ) => Promise<HubChildProcessSession>
}

/**
 * Owns the lifecycle of a single code-server child process: detects the
 * binary, launches it with a freshly generated password-auth token, probes
 * `/healthz` for readiness, and mirrors a secret-free status into shared
 * state. The auth cookie is handed back only through `start()` / `status()`
 * so the already-authorized client can sign the iframe in automatically.
 *
 * Depends only on the core devframe context (shared state), not on the hub.
 */
export class CodeServerSupervisor {
  private readonly bin: string
  private readonly workspace: string
  private readonly host: string
  private readonly forcedPort?: number
  private readonly extraArgs: string[]
  private readonly extraEnv: Record<string, string>
  private readonly cookieName: string
  private readonly cookieSuffix?: string
  private readonly startTimeout: number

  private state?: SharedState<CodeServerSharedState>
  private detection: CodeServerDetection
  private server: CodeServerServerInfo = { status: 'stopped' }

  private proc?: ChildProcess
  private cookieValue?: string
  private logBuffer: string[] = []
  private cleanupRegistered = false

  /** Stable id of the hub terminal session, reused across start/stop. */
  private readonly sessionId: string
  /** The live hub terminal session when launched through `ctx.terminals`. */
  private session?: HubChildProcessSession

  constructor(
    private readonly ctx: DevframeNodeContext,
    options: CodeServerOptions = {},
  ) {
    this.bin = options.bin ?? 'code-server'
    this.workspace = options.cwd ?? ctx.cwd
    this.host = options.host ?? '0.0.0.0'
    this.forcedPort = options.serverPort
    this.extraArgs = options.args ?? []
    this.extraEnv = options.env ?? {}
    this.cookieSuffix = options.cookieSuffix
    this.cookieName = getCookieSessionName(options.cookieSuffix)
    this.startTimeout = options.startTimeout ?? DEFAULT_START_TIMEOUT
    this.detection = { checked: false, installed: false, bin: this.bin }
    this.sessionId = options.cookieSuffix ? `${PLUGIN_ID}:${options.cookieSuffix}` : PLUGIN_ID
  }

  /** Resolve shared state, register process-exit cleanup, run first detection. */
  async init(): Promise<void> {
    if (this.state)
      return
    this.state = await this.ctx.rpc.sharedState.get(STATE_KEY, {
      initialValue: { detection: this.detection, server: this.server } as CodeServerSharedState,
    })
    this.registerCleanup()
    await this.detect()
  }

  /** Re-probe for the code-server binary and publish the result. */
  async detect(): Promise<CodeServerDetection> {
    const result = await detectCodeServer(this.bin)
    this.detection = { checked: true, ...result }
    this.publish()
    return this.detection
  }

  /** Current status (+ auth when running) for the launcher UI. */
  status(): CodeServerStatusResult {
    return {
      detection: { ...this.detection },
      server: { ...this.server },
      auth: this.authInfo(),
    }
  }

  /**
   * Launch code-server (if not already up) and resolve once it answers its
   * readiness probe. Idempotent while starting/running — returns the live
   * status instead of spawning a second process.
   */
  async start(req: CodeServerStartRequest = {}): Promise<CodeServerStartResult> {
    if (this.server.status === 'running' || this.server.status === 'starting')
      return this.status()

    if (!this.detection.checked)
      await this.detect()
    if (!this.detection.installed)
      throw diagnostics.DP_CODE_SERVER_0001({ bin: this.bin })

    const initialPort = this.forcedPort !== undefined && this.forcedPort !== 0
      ? this.forcedPort
      : (this.forcedPort === 0 ? 0 : await getPort({ host: '127.0.0.1', port: DEFAULT_CODE_SERVER_PORT }))
    const token = randomBytes(32).toString('hex')
    this.cookieValue = createHash('sha256').update(token).digest('hex')

    const folder = req.folder ?? this.workspace
    const args = [
      '--auth',
      'password',
      '--bind-addr',
      `${this.host}:${initialPort}`,
      '--disable-telemetry',
      '--disable-update-check',
      ...(this.cookieSuffix ? ['--cookie-suffix', this.cookieSuffix] : []),
      ...this.extraArgs,
      folder,
    ]

    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined)
        env[k] = v
    }
    delete env.PASSWORD
    env.HASHED_PASSWORD = this.cookieValue
    Object.assign(env, this.extraEnv)

    this.logBuffer = []

    let actualPort = initialPort
    let portResolver: ((port: number) => void) | undefined
    let portRejecter: ((err: Error) => void) | undefined
    const portPromise = initialPort === 0
      ? new Promise<number>((resolve, reject) => {
          portResolver = resolve
          portRejecter = reject
        })
      : Promise.resolve(initialPort)

    const child = await this.launchProcess(args, env, folder)

    this.proc = child
    this.server = { status: 'starting', port: actualPort || undefined, pid: child.pid, startedAt: Date.now() }
    this.publish()

    const capture = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      this.appendLog(text)
      if (actualPort === 0 && portResolver) {
        for (const line of text.split('\n')) {
          const match = line.match(/HTTP server listening on https?:\/\/(?:[^:]+|\[[^\]]+\]):(\d+)/)
          if (match) {
            actualPort = Number.parseInt(match[1], 10)
            this.server.port = actualPort
            this.publish()
            portResolver?.(actualPort)
            portResolver = undefined
          }
        }
      }
    }
    child.stdout?.on('data', capture)
    child.stderr?.on('data', capture)

    child.on('error', (error) => {
      if (this.proc !== child)
        return
      this.server = { status: 'error', error: error.message }
      this.proc = undefined
      this.cookieValue = undefined
      if (portRejecter)
        portRejecter?.(error)
      this.publish()
    })
    child.on('exit', (code) => {
      if (this.proc !== child)
        return
      const exitCode = code ?? 0
      const unexpected = this.server.status !== 'stopped'
      const crashed = unexpected && exitCode !== 0
      this.proc = undefined
      this.cookieValue = undefined
      this.server = crashed
        ? { status: 'error', error: this.lastLog() || `code-server exited with code ${exitCode}` }
        : { status: 'stopped' }
      if (crashed)
        diagnostics.DP_CODE_SERVER_0005({ code: exitCode }, { method: 'warn' })
      // Reflect the outcome on the hub terminal session (the hub does not
      // update a child-process session's status on its own exit).
      this.reflectHub(crashed ? 'error' : 'stopped')
      this.session = undefined
      if (portRejecter)
        portRejecter?.(new Error(`code-server exited before binding (code ${exitCode})`))
      this.publish()
    })

    try {
      const port = await Promise.race([
        portPromise,
        new Promise<number>((_, reject) => setTimeout(() => reject(new Error('timeout waiting for dynamic port allocation')), this.startTimeout)),
      ])

      const ready = await this.waitForReady(port)
      if (!ready) {
        throw new Error(this.lastLog() || 'startup timed out')
      }

      if (this.proc !== child)
        return this.status()

      this.server = { status: 'running', port, pid: child.pid, startedAt: this.server.startedAt }
      this.publish()
      return this.status()
    }
    catch (error) {
      if (this.proc === child) {
        this.terminate(child)
        this.reflectHub('error')
        this.session = undefined
        this.server = { status: 'error', error: error instanceof Error ? error.message : String(error) }
        this.proc = undefined
        this.cookieValue = undefined
        this.publish()
      }
      throw diagnostics.DP_CODE_SERVER_0002({ port: actualPort, timeout: this.startTimeout })
    }
  }

  /** Stop the code-server process and reset to `stopped`. */
  stop(): CodeServerStatusResult {
    const child = this.proc
    this.proc = undefined
    this.cookieValue = undefined
    this.server = { status: 'stopped' }
    if (child)
      this.terminate(child)
    this.reflectHub('stopped')
    this.session = undefined
    this.publish()
    return this.status()
  }

  /** Kill the process on host shutdown / test teardown. */
  dispose(): void {
    if (this.proc)
      this.terminate(this.proc)
    this.proc = undefined
    this.cookieValue = undefined
    this.session = undefined
  }

  private authInfo(): CodeServerAuth | undefined {
    if (this.server.status !== 'running' || !this.cookieValue)
      return undefined
    return { cookieName: this.cookieName, cookieValue: this.cookieValue }
  }

  private terminate(child: ChildProcess): void {
    // Hub-launched processes are owned by the hub's terminals subsystem — let
    // it kill the child and close the mirrored output stream.
    if (this.session) {
      void this.session.terminate().catch(() => {})
      return
    }
    try {
      if (process.platform === 'win32' && this.bin.endsWith('.cmd') && child.pid) {
        execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: 'ignore' })
      }
      else {
        child.kill('SIGTERM')
      }
    }
    catch {
      // Already gone.
    }
  }

  /**
   * Resolve the hub's terminals subsystem when this devframe is mounted in a
   * hub. `ctx.terminals` only exists on a `DevframeHubContext`, so it is
   * duck-typed — standalone runtimes (CLI / Vite / build) have no such property
   * and fall back to a direct child process.
   */
  private resolveHubTerminals(): HubTerminalsBridge | undefined {
    const terminals = (this.ctx as { terminals?: HubTerminalsBridge }).terminals
    return terminals && typeof terminals.startChildProcess === 'function' ? terminals : undefined
  }

  /** Update the mirrored hub terminal session's status, when one exists. */
  private reflectHub(status: HubTerminalEntry['status']): void {
    const hub = this.resolveHubTerminals()
    if (hub?.sessions.has(this.sessionId))
      hub.update({ id: this.sessionId, status })
  }

  /**
   * Launch code-server. In a hub, spawn it through `ctx.terminals` so it shows
   * up as a read-only terminal session (proper icon + name) whose output the
   * hub streams to its terminals panel; standalone, spawn it directly. Either
   * way, return the underlying {@link ChildProcess} so the shared readiness /
   * port / log wiring in `start()` is identical.
   */
  private async launchProcess(
    args: string[],
    env: Record<string, string>,
    folder: string,
  ): Promise<ChildProcess> {
    const hub = this.resolveHubTerminals()
    if (hub) {
      // Drop a stale session left by a prior run so the stable id is free to
      // re-register (each start uses a fresh port + password).
      const stale = hub.sessions.get(this.sessionId)
      if (stale)
        hub.remove?.(stale)

      try {
        const session = await hub.startChildProcess(
          {
            command: this.bin,
            args,
            cwd: folder,
            // The hub merges `process.env` under the hood, so neutralize
            // PASSWORD explicitly (we authenticate via HASHED_PASSWORD) rather
            // than relying on it being deleted from the passed env.
            env: { ...env, PASSWORD: '' },
          },
          {
            id: this.sessionId,
            title: TERMINAL_SESSION_TITLE,
            description: folder,
            icon: TERMINAL_SESSION_ICON,
          },
        )
        const child = session.getChildProcess()
        if (!child)
          throw new Error('code-server process handle was unavailable')
        this.session = session
        return child
      }
      catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        const orphan = hub.sessions.get(this.sessionId)
        if (orphan)
          hub.remove?.(orphan)
        this.session = undefined
        this.server = { status: 'error', error: reason }
        this.publish()
        throw diagnostics.DP_CODE_SERVER_0003({ bin: this.bin, reason })
      }
    }

    try {
      return spawn(this.bin, args, {
        cwd: folder,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32' && this.bin.endsWith('.cmd'),
      })
    }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.server = { status: 'error', error: reason }
      this.publish()
      throw diagnostics.DP_CODE_SERVER_0003({ bin: this.bin, reason })
    }
  }

  private appendLog(text: string): void {
    for (const line of text.split('\n')) {
      if (line.length === 0)
        continue
      this.logBuffer.push(line)
    }
    if (this.logBuffer.length > LOG_BUFFER_LINES)
      this.logBuffer.splice(0, this.logBuffer.length - LOG_BUFFER_LINES)
  }

  private lastLog(): string | undefined {
    return this.logBuffer.length ? this.logBuffer[this.logBuffer.length - 1] : undefined
  }

  private publish(): void {
    this.state?.mutate((draft) => {
      draft.detection = { ...this.detection }
      draft.server = { ...this.server }
    })
  }

  /**
   * Poll code-server's unauthenticated `/healthz` endpoint until it responds
   * or the timeout elapses. Returns false if the process exits first.
   */
  private async waitForReady(port: number): Promise<boolean> {
    const deadline = Date.now() + this.startTimeout
    while (Date.now() < deadline) {
      if (!this.proc)
        return false
      if (await probeHealthz(port))
        return true
      await delay(PROBE_INTERVAL)
    }
    return false
  }

  private registerCleanup(): void {
    if (this.cleanupRegistered)
      return
    this.cleanupRegistered = true
    // Synchronously reap the child when the host process exits. Signals
    // (SIGINT/SIGTERM) are left to the host's own shutdown — the child shares
    // our process group, so a terminal interrupt reaches it directly.
    process.once('exit', () => this.dispose())
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
}

function probeHealthz(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path: '/healthz', method: 'GET', timeout: 1500 },
      (res) => {
        res.resume()
        resolve((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 500)
      },
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.end()
  })
}
