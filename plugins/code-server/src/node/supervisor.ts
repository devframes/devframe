import type { DevframeNodeContext } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import type {
  CodeServerBackend,
  CodeServerConnect,
  CodeServerDetection,
  CodeServerLogin,
  CodeServerMode,
  CodeServerOptions,
  CodeServerServerInfo,
  CodeServerSharedState,
  CodeServerStartRequest,
  CodeServerStartResult,
  CodeServerStatusResult,
} from '../types'
import type { CodeServerProfile, ProfileContext } from './backends'
import { execSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { hostname } from 'node:os'
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
import { AUTO_DETECT_ORDER, resolveProfile } from './backends'
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
    terminal: { id: string, title: string, description?: string, icon?: string, restartable?: boolean },
  ) => Promise<HubChildProcessSession>
}

/**
 * Owns the lifecycle of a single editor child process. Resolves a launch
 * {@link CodeServerProfile} (Coder `code-server`, Microsoft `code serve-web`,
 * or `code tunnel`), detects the binary, launches it with freshly generated
 * auth material, waits for readiness, and mirrors a secret-free status into
 * shared state. The connect descriptor (session cookie / connection token /
 * tunnel URL) is handed back only through `start()` / `status()` so the
 * already-authorized client can open the editor without a login page.
 *
 * Depends only on the core devframe context (shared state), not on the hub.
 */
export class CodeServerSupervisor {
  private readonly mode: CodeServerMode
  private readonly explicitBackend?: CodeServerBackend
  private readonly explicitBin?: string
  private readonly workspace: string
  private readonly host: string
  private readonly forcedPort?: number
  private readonly extraArgs: string[]
  private readonly extraEnv: Record<string, string>
  private readonly cookieSuffix?: string
  private readonly cookieName: string
  private readonly startTimeout: number
  private readonly reuseExistingServer: boolean
  private readonly tunnelName: string

  /** Resolved after the first detection. */
  private backend: CodeServerBackend
  private bin: string
  private profile: CodeServerProfile

  private state?: SharedState<CodeServerSharedState>
  private detection: CodeServerDetection
  private server: CodeServerServerInfo = { status: 'stopped' }

  private proc?: ChildProcess
  /** Context of the live launch, used to compute the client connect descriptor. */
  private launchCtx?: ProfileContext
  /** Whether the running server was adopted (reused) rather than launched. */
  private adopted = false
  /** Captured `vscode.dev` URL for a running tunnel. */
  private readyUrl?: string
  private logBuffer: string[] = []
  private exitHandler?: () => void

  /** Stable id of the hub terminal session, reused across start/stop. */
  private readonly sessionId: string
  /** The live hub terminal session when launched through `ctx.terminals`. */
  private session?: HubChildProcessSession

  constructor(
    private readonly ctx: DevframeNodeContext,
    options: CodeServerOptions = {},
  ) {
    this.mode = options.mode ?? 'local'
    this.explicitBackend = options.backend
    this.explicitBin = options.bin
    this.workspace = options.cwd ?? ctx.cwd
    this.host = options.host ?? '127.0.0.1'
    this.forcedPort = options.serverPort
    this.extraArgs = options.args ?? []
    this.extraEnv = options.env ?? {}
    this.cookieSuffix = options.cookieSuffix
    this.cookieName = getCookieSessionName(options.cookieSuffix)
    this.startTimeout = options.startTimeout ?? DEFAULT_START_TIMEOUT
    this.reuseExistingServer = options.reuseExistingServer ?? false
    this.tunnelName = options.tunnel?.name || hostname().split('.').join('') || 'devframe'
    this.sessionId = options.cookieSuffix ? `${PLUGIN_ID}:${options.cookieSuffix}` : PLUGIN_ID

    // Provisional resolution — refined by the first `detect()` (auto-detection).
    this.backend = this.explicitBackend ?? 'code-server'
    this.profile = resolveProfile(this.mode, this.backend)
    this.bin = this.explicitBin ?? this.profile.defaultBin
    this.detection = { checked: false, installed: false, bin: this.bin, backend: this.backend, mode: this.mode }
  }

  /** Resolve shared state, register process-exit cleanup, run first detection. */
  async init(): Promise<void> {
    if (this.state)
      return
    this.state = await this.ctx.rpc.sharedState.get(STATE_KEY, {
      initialValue: { detection: this.detection, server: this.server } as CodeServerSharedState,
    })
    await this.detect()
  }

  /**
   * Probe for a usable editor binary and publish the result. Resolves the
   * backend + binary when the caller left them implicit: tunnel mode always
   * uses `code`; an explicit backend or `bin` is honored as-is; otherwise the
   * plugin tries each {@link AUTO_DETECT_ORDER} candidate and keeps the first
   * that is installed.
   */
  async detect(): Promise<CodeServerDetection> {
    let installed = false
    let version: string | undefined

    if (this.mode === 'tunnel' || this.explicitBackend || this.explicitBin) {
      const result = await detectCodeServer(this.bin)
      installed = result.installed
      version = result.version
    }
    else {
      let resolved: { backend: CodeServerBackend, bin: string, version?: string } | undefined
      for (const backend of AUTO_DETECT_ORDER) {
        const bin = resolveProfile('local', backend).defaultBin
        const result = await detectCodeServer(bin)
        if (result.installed) {
          resolved = { backend, bin, version: result.version }
          break
        }
      }
      if (resolved) {
        this.setResolved(resolved.backend, resolved.bin)
        installed = true
        version = resolved.version
      }
    }

    this.detection = { checked: true, installed, version, bin: this.bin, backend: this.backend, mode: this.mode }
    this.publish()
    return this.detection
  }

  /** Current status (+ connect info when running) for the launcher UI. */
  status(): CodeServerStatusResult {
    return {
      detection: { ...this.detection },
      server: { ...this.server },
      connect: this.connectInfo(),
    }
  }

  /**
   * Launch the editor (if not already up) and resolve once it is reachable.
   * Idempotent while starting/running — returns the live status instead of
   * spawning a second process. In tunnel mode it resolves as soon as either
   * the `vscode.dev` URL or a device-login prompt is seen, so the action never
   * blocks on interactive authentication.
   */
  async start(req: CodeServerStartRequest = {}): Promise<CodeServerStartResult> {
    if (this.server.status === 'running' || this.server.status === 'starting')
      return this.status()

    if (!this.detection.checked)
      await this.detect()
    if (!this.detection.installed)
      throw diagnostics.DP_CODE_SERVER_0001({ bin: this.bin })

    const folder = req.folder ?? this.workspace
    const isLocal = this.profile.kind !== 'tunnel'

    // Adopt an already-running local server when asked.
    if (isLocal && this.reuseExistingServer) {
      const target = this.forcedPort && this.forcedPort !== 0 ? this.forcedPort : DEFAULT_CODE_SERVER_PORT
      if (this.profile.healthPath && await probeHealth(target, this.profile.healthPath)) {
        this.adopted = true
        this.launchCtx = this.baseCtx(folder, target, '')
        this.server = { status: 'running', port: target, startedAt: Date.now() }
        this.publish()
        return this.status()
      }
    }

    const secret = randomBytes(32).toString('hex')
    const initialPort = !isLocal
      ? 0
      : this.forcedPort !== undefined && this.forcedPort !== 0
        ? this.forcedPort
        : this.forcedPort === 0
          ? 0
          : await getPort({ host: '127.0.0.1', port: DEFAULT_CODE_SERVER_PORT })

    const ctx = this.baseCtx(folder, initialPort, secret)
    this.launchCtx = ctx
    this.adopted = false
    this.readyUrl = undefined

    const args = this.profile.buildArgs(ctx)

    const baseEnv: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined)
        baseEnv[k] = v
    }
    Object.assign(baseEnv, this.extraEnv)
    const env = this.profile.buildEnv(ctx, baseEnv)

    this.logBuffer = []

    let actualPort = initialPort
    let portResolver: ((port: number) => void) | undefined
    let portRejecter: ((err: Error) => void) | undefined
    const portPromise = isLocal && initialPort === 0
      ? new Promise<number>((resolve, reject) => {
          portResolver = resolve
          portRejecter = reject
        })
      : Promise.resolve(initialPort)

    // Tunnel readiness / login are surfaced from the child's log stream.
    let readyUrlResolver: ((url: string) => void) | undefined
    let loginResolver: ((login: CodeServerLogin) => void) | undefined
    const readyUrlPromise = new Promise<string>((resolve) => {
      readyUrlResolver = resolve
    })
    const loginPromise = new Promise<CodeServerLogin>((resolve) => {
      loginResolver = resolve
    })

    const child = await this.launchProcess(args, env, folder)
    this.registerCleanup()

    this.proc = child
    this.server = { status: 'starting', port: isLocal ? (actualPort || undefined) : undefined, pid: child.pid, startedAt: Date.now() }
    this.publish()

    const capture = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      this.appendLog(text)
      for (const line of text.split('\n')) {
        if (isLocal && actualPort === 0 && this.profile.matchPort) {
          const port = this.profile.matchPort(line)
          if (port) {
            actualPort = port
            this.server.port = port
            this.publish()
            portResolver?.(port)
            portResolver = undefined
          }
        }
        if (this.profile.matchLogin) {
          const login = this.profile.matchLogin(line)
          if (login && this.proc === child) {
            this.server = { ...this.server, login }
            this.publish()
            loginResolver?.(login)
          }
        }
        if (this.profile.matchReadyUrl) {
          const url = this.profile.matchReadyUrl(line)
          if (url && this.proc === child) {
            this.readyUrl = url
            readyUrlResolver?.(url)
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
      this.reset()
      portRejecter?.(error)
      this.publish()
    })
    child.on('exit', (code) => {
      if (this.proc !== child)
        return
      const exitCode = code ?? 0
      const unexpected = this.server.status !== 'stopped'
      const crashed = unexpected && exitCode !== 0
      this.reset()
      this.server = crashed
        ? { status: 'error', error: this.lastLog() || `${this.bin} exited with code ${exitCode}` }
        : { status: 'stopped' }
      if (crashed)
        diagnostics.DP_CODE_SERVER_0005({ code: exitCode }, { method: 'warn' })
      this.reflectHub(crashed ? 'error' : 'stopped')
      this.session = undefined
      portRejecter?.(new Error(`${this.bin} exited before binding (code ${exitCode})`))
      this.publish()
    })

    try {
      if (!isLocal)
        return await this.awaitTunnel(child, readyUrlPromise, loginPromise)

      const port = await Promise.race([
        portPromise,
        new Promise<number>((_, reject) => setTimeout(() => reject(new Error('timeout waiting for dynamic port allocation')), this.startTimeout)),
      ])

      const ready = await this.waitForReady(port, this.profile.healthPath!)
      if (!ready)
        throw new Error(this.lastLog() || 'startup timed out')

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
        this.reset()
        this.publish()
      }
      if (!isLocal)
        throw diagnostics.DP_CODE_SERVER_0006({ timeout: this.startTimeout })
      throw diagnostics.DP_CODE_SERVER_0002({ port: actualPort, timeout: this.startTimeout })
    }
  }

  /** Stop the editor process and reset to `stopped`. */
  stop(): CodeServerStatusResult {
    const child = this.proc
    const wasAdopted = this.adopted
    this.reset()
    this.server = { status: 'stopped' }
    // Adopted servers were never ours to kill.
    if (child && !wasAdopted)
      this.terminate(child)
    this.reflectHub('stopped')
    this.session = undefined
    this.publish()
    return this.status()
  }

  /** Kill the process on host shutdown / test teardown. */
  dispose(): void {
    if (this.proc && !this.adopted)
      this.terminate(this.proc)
    this.reset()
    this.session = undefined
    if (this.exitHandler) {
      process.off('exit', this.exitHandler)
      this.exitHandler = undefined
    }
  }

  /** Resolved backend for tests / callers. */
  get resolvedBackend(): CodeServerBackend {
    return this.backend
  }

  private setResolved(backend: CodeServerBackend, bin: string): void {
    this.backend = backend
    this.bin = bin
    this.profile = resolveProfile(this.mode, backend)
  }

  private baseCtx(folder: string, port: number, secret: string): ProfileContext {
    return {
      host: this.host,
      port,
      folder,
      secret,
      cookieName: this.cookieName,
      extraArgs: this.extraArgs,
      tunnelName: this.tunnelName,
    }
  }

  /** Clear per-launch process state (keeps `server`/`detection`). */
  private reset(): void {
    this.proc = undefined
    this.launchCtx = undefined
    this.adopted = false
    this.readyUrl = undefined
  }

  /**
   * Resolve start() for a tunnel: succeed as soon as the `vscode.dev` URL
   * appears (→ running) or a device-login prompt is seen (→ starting, so the
   * user can authenticate while the log stream continues to a running URL).
   */
  private async awaitTunnel(
    child: ChildProcess,
    readyUrlPromise: Promise<string>,
    loginPromise: Promise<CodeServerLogin>,
  ): Promise<CodeServerStartResult> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timed out waiting for the tunnel')), this.startTimeout))
    const outcome = await Promise.race([
      readyUrlPromise.then(() => 'ready' as const),
      loginPromise.then(() => 'login' as const),
      timeout,
    ])
    if (this.proc !== child)
      return this.status()
    if (outcome === 'ready') {
      this.server = { status: 'running', pid: child.pid, startedAt: this.server.startedAt }
      // Flip to running when the URL later arrives (already captured here).
      this.publish()
      return this.status()
    }
    // Login pending: keep 'starting' with the prompt, and promote to running
    // once the URL is captured after the user authenticates.
    void readyUrlPromise.then(() => {
      if (this.proc === child && this.server.status !== 'running') {
        this.server = { status: 'running', pid: child.pid, startedAt: this.server.startedAt, login: undefined }
        this.publish()
      }
    })
    return this.status()
  }

  private connectInfo(): CodeServerConnect | undefined {
    if (this.server.status !== 'running' || !this.launchCtx)
      return undefined
    if (this.adopted)
      return this.profile.connectReused({ port: this.launchCtx.port })
    return this.profile.connect({ ...this.launchCtx, port: this.server.port ?? this.launchCtx.port, readyUrl: this.readyUrl })
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
   * Launch the editor binary. In a hub, spawn it through `ctx.terminals` so it
   * shows up as a read-only terminal session (proper icon + name) whose output
   * the hub streams to its terminals panel; standalone, spawn it directly.
   * Either way, return the underlying {@link ChildProcess} so the shared
   * readiness / port / log wiring in `start()` is identical.
   */
  private async launchProcess(
    args: string[],
    env: Record<string, string>,
    folder: string,
  ): Promise<ChildProcess> {
    const hub = this.resolveHubTerminals()
    if (hub) {
      // Drop a stale session left by a prior run so the stable id is free to
      // re-register (each start uses a fresh port + secret).
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
            // PASSWORD explicitly (code-server authenticates via
            // HASHED_PASSWORD) rather than relying on it being deleted.
            env: { ...env, PASSWORD: '' },
          },
          {
            id: this.sessionId,
            title: TERMINAL_SESSION_TITLE,
            description: folder,
            icon: TERMINAL_SESSION_ICON,
            // Restarting the editor means re-running the supervisor's start
            // flow (fresh port + secret), not re-spawning this raw process, so
            // hide the terminal panel's generic restart for this session.
            restartable: false,
          },
        )
        const child = session.getChildProcess()
        if (!child)
          throw new Error('editor process handle was unavailable')
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
   * Poll the server's readiness path until it responds or the timeout elapses.
   * Returns false if the process exits first.
   */
  private async waitForReady(port: number, path: string): Promise<boolean> {
    const deadline = Date.now() + this.startTimeout
    while (Date.now() < deadline) {
      if (!this.proc)
        return false
      if (await probeHealth(port, path))
        return true
      await delay(PROBE_INTERVAL)
    }
    return false
  }

  private registerCleanup(): void {
    if (this.exitHandler)
      return
    // Synchronously reap the child when the host process exits. Signals
    // (SIGINT/SIGTERM) are left to the host's own shutdown — the child shares
    // our process group, so a terminal interrupt reaches it directly. The
    // handler is removed in `dispose()` so it doesn't accumulate.
    this.exitHandler = () => this.dispose()
    process.once('exit', this.exitHandler)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
}

function probeHealth(port: number, path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path, method: 'GET', timeout: 1500 },
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
