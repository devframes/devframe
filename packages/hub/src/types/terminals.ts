import type { EventEmitter } from 'devframe/types'
import type { ChildProcess } from 'node:child_process'
import type { DevframeDockEntryIcon } from './docks'

export interface DevframeTerminalHost {
  readonly sessions: Map<string, DevframeTerminalSession>
  readonly events: EventEmitter<{
    'terminal:session:updated': (session: DevframeTerminalSession) => void
  }>

  register: (session: DevframeTerminalSession) => DevframeTerminalSession
  update: (session: DevframeTerminalSession) => void

  startChildProcess: (
    executeOptions: DevframeChildProcessExecuteOptions,
    terminal: Omit<DevframeTerminalSessionBase, 'status'>,
  ) => Promise<DevframeChildProcessTerminalSession>
}

export type DevframeTerminalStatus = 'running' | 'stopped' | 'error'

export interface DevframeTerminalSessionBase {
  id: string
  title: string
  description?: string
  status: DevframeTerminalStatus
  icon?: DevframeDockEntryIcon
}

export interface DevframeTerminalSession extends DevframeTerminalSessionBase {
  buffer?: string[]
  stream?: ReadableStream<string>
}

export interface DevframeChildProcessExecuteOptions {
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
}

export interface DevframeChildProcessTerminalSession extends DevframeTerminalSession {
  type: 'child-process'
  executeOptions: DevframeChildProcessExecuteOptions
  getChildProcess: () => ChildProcess | undefined
  terminate: () => Promise<void>
  restart: () => Promise<void>
}
