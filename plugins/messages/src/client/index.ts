import type { DevframeRpcClient, DevframeRpcClientOptions } from 'devframe/client'
import { connectDevframe } from 'devframe/client'
import { createApp } from 'vue'
import App from './App.vue'

import 'virtual:uno.css'
import '@antfu/design/styles.css'
import './style.css'

export type { DevframeRpcClient }
export { MESSAGES_UPDATED_EVENT } from '../constants'

/**
 * Connect to the plugin's devframe backend. A thin, typed wrapper around
 * devframe's {@link connectDevframe}; the SPA derives its base from
 * `document.baseURI`, so no options are required in the common case.
 */
export function connectMessages(options?: DevframeRpcClientOptions): Promise<DevframeRpcClient> {
  return connectDevframe(options)
}

export interface MountMessagesOptions {
  /** Reuse an existing RPC client (e.g. the host page's) instead of connecting. */
  rpc?: DevframeRpcClient
}

export interface MessagesHandle {
  rpc: DevframeRpcClient
  dispose: () => void
}

/**
 * Mount the messages panel into a DOM container — the embeddable form a
 * hub `custom-render` dock uses. Styles are injected by the bundle; the
 * host page owns the `.dark` class on `<html>`.
 */
export async function mountMessages(
  container: HTMLElement,
  options: MountMessagesOptions = {},
): Promise<MessagesHandle> {
  const rpc = options.rpc ?? await connectMessages()

  const app = createApp(App, { rpc })
  app.mount(container)

  return {
    rpc,
    dispose() {
      app.unmount()
    },
  }
}

export type {
  DevframeMessageEntry,
  DevframeMessageEntryFrom,
  DevframeMessageEntryInput,
  DevframeMessageLevel,
  DevframeMessagesListDelta,
} from '../types'
export { useMessages } from './state/messages'
export type { MessagesState } from './state/messages'
