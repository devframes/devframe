import { nanoid } from 'devframe/utils/nanoid'
import { DEVFRAME_EVENTS } from '../events'

/**
 * Wire protocol of the in-page channel handshake and its port-level control
 * frames. The envelope is transport-neutral by design: it identifies the
 * protocol (`channel` tag + `v`), the user channel (`name`), and the peers
 * (`panelId`, `instanceId`), so a future cross-tab transport (e.g. a
 * `BroadcastChannel`) can reuse it unchanged.
 */

/** `postMessage` tag every handshake message carries. */
export const IN_PAGE_CHANNEL_TAG = DEVFRAME_EVENTS.postMessage.inPageChannel

/** Envelope version — bump on breaking wire changes. */
export const IN_PAGE_CHANNEL_VERSION = 1

/** Panel → page script: "grant me a port for channel `name`". */
export interface InPageChannelHello {
  channel: typeof IN_PAGE_CHANNEL_TAG
  v: number
  kind: 'hello'
  /** User channel name (e.g. `devframes:plugin:a11y`). */
  name: string
  /** Unique id of the asking panel endpoint. */
  panelId: string
  /** Optional pin: only the page script with this instance id may answer. */
  instanceId?: string
}

/** Page script → panel: "here is your port" (transferred alongside). */
export interface InPageChannelGrant {
  channel: typeof IN_PAGE_CHANNEL_TAG
  v: number
  kind: 'grant'
  /** User channel name, echoed. */
  name: string
  /** The asking panel's id, echoed so the panel matches its own hello. */
  panelId: string
  /** The answering page script's instance id. */
  instanceId: string
}

export type InPageChannelHandshakeMessage = InPageChannelHello | InPageChannelGrant

/**
 * Port-level control frames, filtered out before birpc sees the stream:
 * liveness pings/pongs and the graceful `bye` a closing endpoint sends so
 * its peer reacts immediately instead of waiting for the heartbeat window.
 */
export interface InPageChannelControlFrame {
  __dfIpc: 'ping' | 'pong' | 'bye'
}

export function isControlFrame(data: unknown): data is InPageChannelControlFrame {
  return !!data && typeof data === 'object' && '__dfIpc' in data
}

export function isHandshakeMessage(data: unknown): data is InPageChannelHandshakeMessage {
  if (!data || typeof data !== 'object')
    return false
  const message = data as Partial<InPageChannelHandshakeMessage>
  return message.channel === IN_PAGE_CHANNEL_TAG
    && typeof message.name === 'string'
    && typeof message.panelId === 'string'
    && (message.kind === 'hello' || message.kind === 'grant')
}

const INSTANCE_STORAGE_KEY = 'devframe:in-page-channel:instance'
let memoryInstanceId: string | undefined

/**
 * The page context's instance id: one nanoid per browser tab, persisted in
 * `sessionStorage` so it survives page-script reloads. It scopes handshakes
 * when the same app is open in several tabs — a panel pinned to an instance
 * id ignores grants from every other tab's page script.
 */
export function resolveInstanceId(win: Window | undefined): string {
  try {
    const storage = win?.sessionStorage
    if (storage) {
      let id = storage.getItem(INSTANCE_STORAGE_KEY)
      if (!id) {
        id = nanoid()
        storage.setItem(INSTANCE_STORAGE_KEY, id)
      }
      return id
    }
  }
  catch {
    // Storage unavailable (sandboxed iframe, disabled cookies) — fall through.
  }
  memoryInstanceId ??= nanoid()
  return memoryInstanceId
}

/** Resolve the origins accepted during the handshake (default: same-origin). */
export function resolveAllowedOrigins(allowedOrigins: string[] | undefined, win: Window | undefined): string[] {
  if (allowedOrigins?.length)
    return allowedOrigins
  const origin = win?.location?.origin
  return origin && origin !== 'null' ? [origin] : ['*']
}

/**
 * Default handshake targets of a panel: its ancestor chain plus its
 * `opener` — every same-tab window a page script can live in. `WindowProxy`
 * references stay valid across navigations, so hellos posted to these reach
 * a page script even after the host page reloads.
 */
export function defaultHandshakeTargets(win: Window): Window[] {
  const targets: Window[] = []
  try {
    let current: Window = win
    // `.parent`/`.opener` are accessible across origins; same-origin is
    // enforced by the handshake origin check, not by this walk.
    while (current.parent && current.parent !== current) {
      targets.push(current.parent)
      current = current.parent
    }
  }
  catch {
    // Walking stopped by the browser — keep what we have.
  }
  try {
    const opener = win.opener as Window | null
    if (opener && opener !== win)
      targets.push(opener)
  }
  catch {
    // Inaccessible opener — ignore.
  }
  return targets
}
