import type { DevframeDockEntryIcon, DevframeViewIframe, NavTarget } from '../types/docks'
import type { DockRegistration, DocksEntriesContext } from './docks'

/**
 * Shared-iframe soft navigation — the viewer-side half of a host↔iframe
 * `postMessage` protocol.
 *
 * An {@link DevframeViewIframe.subTabs anchor} iframe dock owns one live iframe
 * (its {@link DevframeViewIframe.frameId frameId}); the embedded app ships a
 * tiny **nav shim** that announces its tabs and answers navigation over
 * `postMessage`. This adapter, auto-attached by the client host when the anchor
 * iframe mounts, runs the ready handshake, turns the reported tab manifest into
 * **client-only** member docks (via {@link DocksEntriesContext.register}), and
 * drives the bidirectional nav loop:
 *
 * - selecting a member dock posts a `navigate` (client-side, no reload);
 * - the app posts `navigated` on any internal navigation, moving the dock
 *   highlight to match.
 *
 * The protocol is server-free (works cross-origin and in static builds) and
 * decoupled — the embedded app takes no hub/RPC dependency, only the shim.
 */

/** `postMessage` channel tag shared by both halves of the protocol. */
export const FRAME_NAV_CHANNEL = 'devframe:frame-nav'
/** Protocol version. */
export const FRAME_NAV_VERSION = 1

/** Envelope every frame-nav message carries. */
export interface FrameNavEnvelope {
  channel: typeof FRAME_NAV_CHANNEL
  v: typeof FRAME_NAV_VERSION
  frameId: string
  /** Direction tag; each side ignores messages with its own `from`. */
  from: 'host' | 'frame'
}

/**
 * One tab in the manifest the shim reports. Maps directly onto a dock entry, so
 * a materialized member dock is first-class.
 */
export interface FrameTab {
  /** Unique within the frame. The member dock id becomes `<frameId>:<id>`. */
  id: string
  title: string
  icon?: DevframeDockEntryIcon
  /** Soft-nav target the app maps to its own router. */
  navTarget: NavTarget
  /**
   * Absolute or anchor-relative URL used for the boot deep-link and the
   * hard-nav fallback. When omitted, one is derived from the anchor URL +
   * `navTarget.path` (hash routing).
   */
  fallbackUrl?: string
  badge?: string
  order?: number
  category?: string
  when?: string
  groupId?: string
}

/** Host → frame message payloads (without the {@link FrameNavEnvelope}). */
export type FrameNavHostPayload
  = | { type: 'hello' }
    | { type: 'navigate', tabId: string, navTarget: NavTarget }

/** Host → frame messages. */
export type FrameNavHostMessage = FrameNavEnvelope & { from: 'host' } & FrameNavHostPayload

/** Frame → host messages. */
export type FrameNavFrameMessage = FrameNavEnvelope & { from: 'frame' } & (
  | { type: 'ready', tabs: FrameTab[], current?: string }
  | { type: 'manifest', tabs: FrameTab[], current?: string }
  | { type: 'navigated', tabId?: string, navTarget?: NavTarget }
)

/** Minimal window surface the adapter listens on (injectable for tests). */
export interface FrameNavListenTarget {
  addEventListener: (type: 'message', listener: (ev: MessageEvent) => void) => void
  removeEventListener: (type: 'message', listener: (ev: MessageEvent) => void) => void
}

export interface FrameNavClientOptions {
  /** The shared frame id (defaults to the anchor's, else the anchor id). */
  frameId: string
  /** The anchor iframe dock entry — supplies url/icon/groupId defaults. */
  anchor: DevframeViewIframe
  /** The live iframe element hosting the embedded app. */
  iframe: Pick<HTMLIFrameElement, 'contentWindow' | 'src'>
  /** Client docks context — to register members and drive selection. */
  docks: Pick<DocksEntriesContext, 'register' | 'switchEntry' | 'getStateById'>
  /**
   * Window to receive the frame's `message` events on (the host page window).
   * Defaults to `globalThis`.
   */
  window?: FrameNavListenTarget
  /** Expected origin for `postMessage`; derived from the anchor URL otherwise. */
  origin?: string
  /** @default 3000 */
  handshakeTimeoutMs?: number
}

export interface FrameNavClient {
  /** Whether the shim has completed its `ready` handshake. */
  readonly ready: boolean
  /** The tab id currently shown in the frame, or `null`. */
  readonly currentTabId: string | null
  dispose: () => void
}

interface MemberRecord {
  tab: FrameTab
  handle: DockRegistration<DevframeViewIframe>
  off?: () => void
}

/**
 * Attach the frame-nav adapter to a mounted anchor iframe. Returns a handle
 * exposing readiness/current state and a `dispose()` that removes every member
 * dock it registered and detaches its listener.
 */
export function attachFrameNavClient(options: FrameNavClientOptions): FrameNavClient {
  const { frameId, anchor, iframe, docks } = options
  const listenTarget: FrameNavListenTarget = options.window ?? (globalThis as unknown as FrameNavListenTarget)
  const expectedOrigin = options.origin ?? resolveOrigin(anchor.url)
  const timeoutMs = options.handshakeTimeoutMs ?? anchor.subTabs?.handshakeTimeoutMs ?? 3000

  const members = new Map<string, MemberRecord>()
  let ready = false
  let currentTabId: string | null = null
  let disposed = false
  let handshakeTimer: ReturnType<typeof setTimeout> | undefined

  function post(message: FrameNavHostPayload): void {
    iframe.contentWindow?.postMessage(
      { channel: FRAME_NAV_CHANNEL, v: FRAME_NAV_VERSION, frameId, from: 'host', ...message },
      expectedOrigin,
    )
  }

  function onMessage(ev: MessageEvent): void {
    if (disposed)
      return
    // Origin-lock (skipped only when we could not resolve one — dev fallback).
    if (expectedOrigin !== '*' && ev.origin !== expectedOrigin)
      return
    const data = ev.data as Partial<FrameNavFrameMessage> | undefined
    if (
      !data
      || data.channel !== FRAME_NAV_CHANNEL
      || data.v !== FRAME_NAV_VERSION
      || data.frameId !== frameId
      || data.from !== 'frame'
    ) {
      return
    }
    switch (data.type) {
      case 'ready':
      case 'manifest':
        markReady()
        reconcileManifest(data.tabs ?? [], data.current)
        break
      case 'navigated':
        onNavigated(data.tabId)
        break
    }
  }

  function markReady(): void {
    ready = true
    if (handshakeTimer !== undefined) {
      clearTimeout(handshakeTimer)
      handshakeTimer = undefined
    }
  }

  function memberId(tabId: string): string {
    return `${frameId}:${tabId}`
  }

  function buildMemberEntry(tab: FrameTab): DevframeViewIframe {
    const entry: DevframeViewIframe = {
      id: memberId(tab.id),
      type: 'iframe',
      title: tab.title,
      icon: tab.icon ?? anchor.icon,
      frameId,
      url: tab.fallbackUrl ?? deriveFallbackUrl(anchor.url, tab.navTarget),
      navTarget: tab.navTarget,
    }
    if (tab.badge !== undefined)
      entry.badge = tab.badge
    if (tab.order !== undefined)
      entry.defaultOrder = tab.order
    if (tab.category !== undefined)
      entry.category = tab.category
    if (tab.when !== undefined)
      entry.when = tab.when
    const groupId = tab.groupId ?? anchor.groupId
    if (groupId !== undefined)
      entry.groupId = groupId
    return entry
  }

  function reconcileManifest(tabs: FrameTab[], current?: string): void {
    const incoming = new Set(tabs.map(t => t.id))

    for (const tab of tabs) {
      const entry = buildMemberEntry(tab)
      const existing = members.get(tab.id)
      if (existing) {
        existing.tab = tab
        existing.handle.update(entry)
      }
      else {
        const handle = docks.register(entry) as DockRegistration<DevframeViewIframe>
        const record: MemberRecord = { tab, handle }
        // Selecting the member dock in the viewer drives a soft-nav.
        record.off = docks
          .getStateById(entry.id)
          ?.events
          .on('entry:activated', () => onMemberActivated(tab.id))
        members.set(tab.id, record)
      }
    }

    for (const [tabId, record] of [...members]) {
      if (incoming.has(tabId))
        continue
      record.off?.()
      record.handle.dispose()
      members.delete(tabId)
      // Removing the active member clears selection (host reconcile drops the
      // selected id when its entry disappears); keep our mirror consistent.
      if (currentTabId === tabId)
        currentTabId = null
    }

    if (current !== undefined && current !== currentTabId && members.has(current)) {
      // Set before switching so the resulting `entry:activated` is a no-op.
      currentTabId = current
      void docks.switchEntry(memberId(current))
    }
  }

  function onMemberActivated(tabId: string): void {
    if (disposed || tabId === currentTabId)
      return
    const record = members.get(tabId)
    if (!record)
      return
    currentTabId = tabId
    if (ready)
      post({ type: 'navigate', tabId, navTarget: record.tab.navTarget })
    else
      hardNav(record.tab)
  }

  function onNavigated(tabId: string | undefined): void {
    if (disposed || !tabId || !members.has(tabId) || tabId === currentTabId)
      return
    // Set before switching so `onMemberActivated` treats it as an echo no-op.
    currentTabId = tabId
    void docks.switchEntry(memberId(tabId))
  }

  function hardNav(tab: FrameTab): void {
    iframe.src = tab.fallbackUrl ?? deriveFallbackUrl(anchor.url, tab.navTarget)
  }

  // Boot: listen, greet the shim, and arm the no-shim timeout.
  listenTarget.addEventListener('message', onMessage)
  post({ type: 'hello' })
  handshakeTimer = setTimeout(() => {
    handshakeTimer = undefined
  }, timeoutMs)

  return {
    get ready() {
      return ready
    },
    get currentTabId() {
      return currentTabId
    },
    dispose() {
      if (disposed)
        return
      disposed = true
      if (handshakeTimer !== undefined)
        clearTimeout(handshakeTimer)
      listenTarget.removeEventListener('message', onMessage)
      for (const record of members.values()) {
        record.off?.()
        record.handle.dispose()
      }
      members.clear()
    },
  }
}

/** Resolve the origin to lock `postMessage` to; `'*'` when unresolvable. */
function resolveOrigin(url: string): string {
  const base = (globalThis as { location?: { href?: string } }).location?.href
  try {
    return new URL(url).origin
  }
  catch {}
  if (base) {
    try {
      return new URL(url, base).origin
    }
    catch {}
  }
  return '*'
}

/**
 * Derive a deep-link/fallback URL from the anchor base + a nav target, using
 * hash routing (the safest generic for SPA routers). `state` cannot ride a URL
 * and is intentionally dropped here.
 */
function deriveFallbackUrl(base: string, navTarget: NavTarget): string {
  const href = (globalThis as { location?: { href?: string } }).location?.href
  let url: URL
  try {
    url = new URL(base, href ?? 'http://localhost')
  }
  catch {
    return base
  }
  const path = navTarget.path.startsWith('#') ? navTarget.path.slice(1) : navTarget.path
  let hash = `#${path}`
  const query = navTarget.query
  if (query) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      // `typeof` (not `Array.isArray`) so the string branch narrows cleanly —
      // `Array.isArray` leaves a `readonly string[]` in the negative branch.
      if (typeof value === 'string') {
        params.set(key, value)
      }
      else {
        for (const v of value) params.append(key, v)
      }
    }
    const qs = params.toString()
    if (qs)
      hash += (path.includes('?') ? '&' : '?') + qs
  }
  url.hash = hash
  return url.toString()
}
