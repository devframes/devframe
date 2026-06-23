import type { DevframeRpcClient } from 'devframe/client'
import { connectDevframe } from 'devframe/client'
import { mount, unmount } from 'svelte'
import App from './App.svelte'

import 'virtual:uno.css'
import './styles.css'

export interface MountTerminalsOptions {
  rpc?: DevframeRpcClient
  autostart?: boolean
}

export interface TerminalsHandle {
  rpc: DevframeRpcClient
  dispose: () => void
}

export async function mountTerminals(
  container: HTMLElement,
  options: MountTerminalsOptions = {},
): Promise<TerminalsHandle> {
  const rpc = options.rpc ?? (await connectDevframe()) as unknown as DevframeRpcClient

  const app = mount(App, {
    target: container,
    props: {
      rpc,
      autostart: options.autostart !== false,
    },
  })

  return {
    rpc,
    dispose() {
      unmount(app)
    },
  }
}

export { TERMINAL_STREAM_CHANNEL } from '../constants'
export type { TerminalPreset, TerminalSessionInfo } from '../types'
