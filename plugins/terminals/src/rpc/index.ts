import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import type { TerminalPreset, TerminalsSharedState } from '../types'
import { clearExited } from './functions/clear-exited'
import { list } from './functions/list'
import { presets } from './functions/presets'
import { remove } from './functions/remove'
import { rename } from './functions/rename'
import { resize } from './functions/resize'
import { restart } from './functions/restart'
import { spawn } from './functions/spawn'
import { terminate } from './functions/terminate'
import { write } from './functions/write'

export const serverFunctions = [
  list,
  presets,
  spawn,
  write,
  resize,
  terminate,
  restart,
  rename,
  remove,
  clearExited,
] as const

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}

  interface DevframeRpcSharedStates {
    'devframes:plugin:terminals:sessions': TerminalsSharedState
    'devframes:plugin:terminals:presets': { presets: TerminalPreset[] }
  }
}
