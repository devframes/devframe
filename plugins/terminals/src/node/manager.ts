import type { DevframeNodeContext, RpcStreamingChannel } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { StreamSink } from 'devframe/utils/streaming-channel'
import type {
  SpawnRequest,
  TerminalMode,
  TerminalPreset,
  TerminalSessionInfo,
  TerminalsOptions,
  TerminalsSharedState,
  TerminalStatus,
} from '../types'
import type { TerminalProcess } from './backend'
import process from 'node:process'
import { nanoid } from 'devframe/utils/nanoid'
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  DEFAULT_SCROLLBACK,
  PRESETS_STATE_KEY,
  SESSIONS_STATE_KEY,
  TERMINAL_STREAM_CHANNEL,
} from '../constants'
import { isPtyAvailable, spawnBackend } from './backend'
import { diagnostics } from './diagnostics'

interface ResolvedSpawn {
  command: string
  args: string[]
  cwd: string
  mode: TerminalMode
  env: Record<string, string>
  title: string
  cols: number
  rows: number
  presetId?: string
}

interface ManagedSession {
  info: TerminalSessionInfo
  sink: StreamSink<string>
  spawn: ResolvedSpawn
  proc?: TerminalProcess
  pollTimer?: ReturnType<typeof setInterval>
}

/** How often a PTY session's foreground process name is polled. */
const PROCESS_POLL_INTERVAL = 1000

/**
 * Minimal shape of the hub's terminals subsystem (`DevframeHubContext.terminals`)
 * that this manager reflects sessions into. Declared locally and accessed by
 * duck-typing so the plugin keeps no build/runtime dependency on
 * `@devframes/hub` and works unchanged outside a hub.
 */
interface HubTerminalEntry {
  id: string
  title: string
  description?: string
  status: 'running' | 'stopped' | 'error'
  icon?: string
}
interface HubTerminalsBridge {
  sessions: Map<string, { id: string }>
  register: (session: HubTerminalEntry) => unknown
  update: (session: HubTerminalEntry) => void
  remove?: (session: { id: string }) => void
}

/** Map the plugin's session status onto the hub's coarser status set. */
const HUB_STATUS: Record<TerminalStatus, HubTerminalEntry['status']> = {
  running: 'running',
  exited: 'stopped',
  error: 'error',
}

function defaultShell(): string {
  if (process.platform === 'win32')
    return process.env.COMSPEC || 'powershell.exe'
  return process.env.SHELL || 'bash'
}

/**
 * Owns terminal session lifecycle: spawns PTY / piped backends, streams
 * their output over the `devframes-plugin-terminals:output` channel (one
 * stream per session, stable for the session's whole life so restarts reuse
 * the same id), and mirrors a serializable session list into shared state.
 */
export class TerminalManager {
  readonly shell: string
  readonly shellArgs: string[]
  readonly defaultCwd: string
  readonly defaultMode: TerminalMode
  readonly allowArbitraryCommands: boolean
  readonly presets: TerminalPreset[]

  private channel: RpcStreamingChannel<string>
  private sessionsState?: SharedState<TerminalsSharedState>
  private sessions = new Map<string, ManagedSession>()
  private ptyAvailable = false
  /** Session ids this manager has registered into the hub (when hubbed). */
  private hubOwned = new Set<string>()

  constructor(
    private ctx: DevframeNodeContext,
    private options: TerminalsOptions = {},
  ) {
    this.shell = options.shell ?? defaultShell()
    this.shellArgs = options.shellArgs ?? []
    this.defaultCwd = options.cwd ?? ctx.cwd
    this.defaultMode = options.defaultMode ?? 'interactive'
    this.allowArbitraryCommands = options.allowArbitraryCommands ?? false
    this.presets = options.presets ?? []
    this.channel = ctx.rpc.streaming.create<string>(TERMINAL_STREAM_CHANNEL, {
      replayWindow: options.scrollback ?? DEFAULT_SCROLLBACK,
    })
  }

  /** Resolve shared state, probe the PTY backend, publish the preset catalog. */
  async init(): Promise<void> {
    if (this.sessionsState)
      return
    this.ptyAvailable = await isPtyAvailable()
    this.sessionsState = await this.ctx.rpc.sharedState.get(SESSIONS_STATE_KEY, {
      initialValue: { sessions: [] },
    })
    const presetsState = await this.ctx.rpc.sharedState.get(PRESETS_STATE_KEY, {
      initialValue: { presets: [] },
    })
    presetsState.mutate((draft: any) => {
      draft.presets = this.presets.map(p => ({
        id: p.id,
        title: p.title,
        command: p.command,
        args: p.args ?? [],
        mode: p.mode ?? 'readonly',
        icon: p.icon,
      }))
    })
  }

  list(): TerminalSessionInfo[] {
    return Array.from(this.sessions.values()).map(s => ({ ...s.info }))
  }

  getPresets(): TerminalPreset[] {
    return this.presets.map(p => ({ ...p }))
  }

  private buildEnv(extra?: Record<string, string>): Record<string, string> {
    const base: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined)
        base[k] = v
    }
    return {
      ...base,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
      ...this.options.env,
      ...extra,
    }
  }

  private resolveSpawn(req: SpawnRequest): ResolvedSpawn {
    const cols = req.cols ?? DEFAULT_COLS
    const rows = req.rows ?? DEFAULT_ROWS

    if (req.presetId) {
      const preset = this.presets.find(p => p.id === req.presetId)
      if (!preset)
        throw diagnostics.DP_TERMINALS_0006({ id: req.presetId })
      return {
        command: preset.command,
        args: req.args ?? preset.args ?? [],
        cwd: req.cwd ?? preset.cwd ?? this.defaultCwd,
        mode: req.mode ?? preset.mode ?? 'readonly',
        env: this.buildEnv({ ...preset.env, ...req.env }),
        title: req.title ?? preset.title,
        cols,
        rows,
        presetId: preset.id,
      }
    }

    if (req.command) {
      if (!this.allowArbitraryCommands && req.command !== this.shell)
        throw diagnostics.DP_TERMINALS_0002({ command: req.command })
      return {
        command: req.command,
        args: req.args ?? [],
        cwd: req.cwd ?? this.defaultCwd,
        mode: req.mode ?? 'interactive',
        env: this.buildEnv(req.env),
        title: req.title ?? req.command,
        cols,
        rows,
      }
    }

    // Default: an interactive shell.
    return {
      command: this.shell,
      args: this.shellArgs,
      cwd: req.cwd ?? this.defaultCwd,
      mode: req.mode ?? this.defaultMode,
      env: this.buildEnv(req.env),
      title: req.title ?? 'Shell',
      cols,
      rows,
    }
  }

  /**
   * Spawn a session and return its descriptor immediately. The OS process
   * is launched in the background and streams into the session's stream as
   * soon as it produces output; clients can subscribe by id right away.
   */
  spawn(req: SpawnRequest = {}): TerminalSessionInfo {
    const spawn = this.resolveSpawn(req)
    const id = nanoid()
    const usePty = spawn.mode === 'interactive' && this.ptyAvailable

    const sink = this.channel.start({ id })
    const info: TerminalSessionInfo = {
      id,
      title: spawn.title,
      mode: spawn.mode,
      status: 'running',
      backend: usePty ? 'pty' : 'pipe',
      command: spawn.command,
      args: spawn.args,
      cwd: spawn.cwd,
      cols: spawn.cols,
      rows: spawn.rows,
      presetId: spawn.presetId,
      createdAt: Date.now(),
    }
    const session: ManagedSession = { info, sink, spawn }
    this.sessions.set(id, session)

    void this.launch(session)
    this.publish()
    return { ...info }
  }

  private async launch(session: ManagedSession): Promise<void> {
    const { spawn, sink } = session
    let proc
    try {
      proc = await spawnBackend(
        {
          command: spawn.command,
          args: spawn.args,
          cwd: spawn.cwd,
          env: spawn.env,
          cols: spawn.cols,
          rows: spawn.rows,
          input: spawn.mode === 'interactive',
        },
        spawn.mode === 'interactive',
      )
    }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      diagnostics.DP_TERMINALS_0004({ command: spawn.command, reason }, { method: 'warn' })
      session.info.status = 'error'
      session.info.pid = undefined
      if (!sink.closed)
        sink.write(`\r\n\x1B[31m[failed to start: ${reason}]\x1B[0m\r\n`)
      this.publish()
      return
    }

    session.proc = proc
    session.info.status = 'running'
    session.info.exitCode = undefined
    session.info.backend = proc.backend
    session.info.pid = proc.pid

    proc.onData((data) => {
      if (!sink.closed)
        sink.write(data)
    })
    proc.onExit((code) => {
      // Ignore the exit of a process replaced by restart().
      if (session.proc !== proc)
        return
      this.stopProcessPoll(session)
      session.info.status = code === 0 ? 'exited' : 'error'
      session.info.exitCode = code
      session.info.pid = undefined
      session.info.processName = undefined
      if (!sink.closed)
        sink.write(`\r\n\x1B[2m[process exited with code ${code}]\x1B[0m\r\n`)
      this.publish()
    })

    this.startProcessPoll(session)
    this.publish()
  }

  /**
   * Poll the PTY foreground process name and reflect changes (e.g. `bash`
   * → `vim` → `bash`) into the session info. The interval is `unref`'d so
   * it never keeps the process alive on its own.
   */
  private startProcessPoll(session: ManagedSession): void {
    const read = session.proc?.getProcessName
    if (!read)
      return
    const poll = (): void => {
      const name = session.proc?.getProcessName?.()
      if (name && name !== session.info.processName) {
        session.info.processName = name
        this.publish()
      }
    }
    poll()
    session.pollTimer = setInterval(poll, PROCESS_POLL_INTERVAL)
    session.pollTimer.unref?.()
  }

  private stopProcessPoll(session: ManagedSession): void {
    if (session.pollTimer) {
      clearInterval(session.pollTimer)
      session.pollTimer = undefined
    }
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id)
    if (!session)
      throw diagnostics.DP_TERMINALS_0001({ id })
    if (session.info.mode !== 'interactive')
      throw diagnostics.DP_TERMINALS_0003({ id })
    if (session.info.status !== 'running')
      return
    session.proc?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (!session)
      throw diagnostics.DP_TERMINALS_0001({ id })
    session.info.cols = cols
    session.info.rows = rows
    session.spawn.cols = cols
    session.spawn.rows = rows
    session.proc?.resize(cols, rows)
  }

  /** Stop the process but keep the session (and its stream) around. */
  terminate(id: string): void {
    const session = this.sessions.get(id)
    if (!session)
      throw diagnostics.DP_TERMINALS_0001({ id })
    session.proc?.kill()
  }

  /** Set a custom display name. Pass an empty string to clear it. */
  rename(id: string, title: string): void {
    const session = this.sessions.get(id)
    if (!session)
      throw diagnostics.DP_TERMINALS_0001({ id })
    const trimmed = title.trim()
    session.info.customTitle = trimmed.length ? trimmed : undefined
    this.publish()
  }

  /** Restart the session's command in place, reusing the same stream id. */
  restart(id: string): TerminalSessionInfo {
    const session = this.sessions.get(id)
    if (!session)
      throw diagnostics.DP_TERMINALS_0001({ id })
    const previous = session.proc
    session.proc = undefined
    this.stopProcessPoll(session)
    previous?.kill()
    if (!session.sink.closed)
      session.sink.write('\r\n\x1B[2m[restarting…]\x1B[0m\r\n')
    session.info.status = 'running'
    session.info.exitCode = undefined
    void this.launch(session)
    this.publish()
    return { ...session.info }
  }

  /** Kill the process, close the stream, and drop the session. */
  remove(id: string): void {
    const session = this.sessions.get(id)
    if (!session)
      throw diagnostics.DP_TERMINALS_0001({ id })
    const proc = session.proc
    session.proc = undefined
    this.stopProcessPoll(session)
    proc?.kill()
    if (!session.sink.closed)
      session.sink.close()
    this.sessions.delete(id)
    this.publish()
  }

  /** Tear everything down — used on server shutdown and in tests. */
  dispose(): void {
    for (const session of this.sessions.values()) {
      this.stopProcessPoll(session)
      session.proc?.kill()
      if (!session.sink.closed)
        session.sink.close()
    }
    this.sessions.clear()
    this.publish()
  }

  private publish(): void {
    this.sessionsState?.mutate((draft) => {
      draft.sessions = this.list()
    })
    this.syncHub()
  }

  /**
   * Reflect the live session list into the hub's terminals subsystem when this
   * devframe is mounted in a hub. `ctx.terminals` only exists on a
   * `DevframeHubContext`, so it's accessed by duck-typing — standalone runtimes
   * (CLI / Vite / build) have no such property and skip silently. This is what
   * surfaces the plugin's sessions in the hub's own terminals panel.
   */
  private syncHub(): void {
    const hub = (this.ctx as { terminals?: HubTerminalsBridge }).terminals
    if (!hub?.register)
      return

    const live = new Set<string>()
    for (const { info } of this.sessions.values()) {
      live.add(info.id)
      const entry: HubTerminalEntry = {
        id: info.id,
        title: info.customTitle || info.processName || info.title,
        description: `${info.mode} · ${info.backend}${info.pid ? ` · pid ${info.pid}` : ''}`,
        status: HUB_STATUS[info.status] ?? 'stopped',
        icon: 'ph:terminal-window-duotone',
      }
      if (hub.sessions.has(info.id)) {
        hub.update(entry)
      }
      else {
        hub.register(entry)
        this.hubOwned.add(info.id)
      }
    }

    // Drop hub entries this manager owns once their session is gone.
    for (const id of [...this.hubOwned]) {
      if (!live.has(id)) {
        hub.remove?.({ id })
        this.hubOwned.delete(id)
      }
    }
  }
}
