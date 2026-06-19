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
  STATE_KEY,
} from '../constants'
import { detectCodeServer } from './detect'
import { diagnostics } from './diagnostics'

/** Recent output lines retained for surfacing startup failures. */
const LOG_BUFFER_LINES = 200
/** Interval between readiness probes. */
const PROBE_INTERVAL = 250

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

    const port = this.forcedPort ?? (await getPort({ host: '127.0.0.1', port: DEFAULT_CODE_SERVER_PORT }))
    const token = randomBytes(32).toString('hex')
    this.cookieValue = createHash('sha256').update(token).digest('hex')

    const folder = req.folder ?? this.workspace
    const args = [
      '--auth',
      'password',
      '--bind-addr',
      `${this.host}:${port}`,
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

    let child: ChildProcess
    try {
      child = spawn(this.bin, args, {
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

    this.proc = child
    this.server = { status: 'starting', port, pid: child.pid, startedAt: Date.now() }
    this.publish()

    const capture = (chunk: Buffer): void => this.appendLog(chunk.toString('utf8'))
    child.stdout?.on('data', capture)
    child.stderr?.on('data', capture)

    child.on('error', (error) => {
      if (this.proc !== child)
        return
      this.server = { status: 'error', error: error.message }
      this.proc = undefined
      this.cookieValue = undefined
      this.publish()
    })
    child.on('exit', (code) => {
      if (this.proc !== child)
        return
      const exitCode = code ?? 0
      const unexpected = this.server.status !== 'stopped'
      this.proc = undefined
      this.cookieValue = undefined
      this.server = unexpected && exitCode !== 0
        ? { status: 'error', error: this.lastLog() || `code-server exited with code ${exitCode}` }
        : { status: 'stopped' }
      if (unexpected && exitCode !== 0)
        diagnostics.DP_CODE_SERVER_0005({ code: exitCode }, { method: 'warn' })
      this.publish()
    })

    const ready = await this.waitForReady(port)
    if (!ready) {
      this.terminate(child)
      this.server = { status: 'error', error: this.lastLog() || 'startup timed out' }
      this.proc = undefined
      this.cookieValue = undefined
      this.publish()
      throw diagnostics.DP_CODE_SERVER_0002({ port, timeout: this.startTimeout })
    }

    // The exit handler may have fired during the probe window.
    if (this.proc !== child)
      return this.status()

    this.server = { status: 'running', port, pid: child.pid, startedAt: this.server.startedAt }
    this.publish()
    return this.status()
  }

  /** Stop the code-server process and reset to `stopped`. */
  stop(): CodeServerStatusResult {
    const child = this.proc
    this.proc = undefined
    this.cookieValue = undefined
    this.server = { status: 'stopped' }
    if (child)
      this.terminate(child)
    this.publish()
    return this.status()
  }

  /** Kill the process on host shutdown / test teardown. */
  dispose(): void {
    if (this.proc)
      this.terminate(this.proc)
    this.proc = undefined
    this.cookieValue = undefined
  }

  private authInfo(): CodeServerAuth | undefined {
    if (this.server.status !== 'running' || !this.cookieValue)
      return undefined
    return { cookieName: this.cookieName, cookieValue: this.cookieValue }
  }

  private terminate(child: ChildProcess): void {
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
