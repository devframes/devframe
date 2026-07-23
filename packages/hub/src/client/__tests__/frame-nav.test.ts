import type { DevframeViewIframe } from '../../types/docks'
import type { DockEntryState, DocksEntriesContext } from '../docks'
import type { FrameTab } from '../frame-nav'
import { createEventEmitter } from 'devframe/utils/events'
import { describe, expect, it, vi } from 'vitest'
import { attachFrameNavClient, FRAME_NAV_CHANNEL, FRAME_NAV_VERSION } from '../frame-nav'

const ORIGIN = 'https://app.example'

function anchorEntry(extra?: Partial<DevframeViewIframe>): DevframeViewIframe {
  return {
    id: 'nuxt',
    type: 'iframe',
    title: 'Nuxt',
    icon: 'i-logos:nuxt',
    url: `${ORIGIN}/__nuxt/`,
    frameId: 'nuxt',
    subTabs: { protocol: 'postmessage' },
    groupId: 'nuxt-group',
    ...extra,
  }
}

function createDocksStub() {
  const entries = new Map<string, DevframeViewIframe>()
  const states = new Map<string, DockEntryState>()
  let selectedId: string | null = null

  function makeState(id: string): DockEntryState {
    return {
      get entryMeta() {
        return entries.get(id)!
      },
      set entryMeta(_v) {},
      get isActive() {
        return selectedId === id
      },
      domElements: {},
      events: createEventEmitter(),
    } as DockEntryState
  }

  const docks: Pick<DocksEntriesContext, 'register' | 'switchEntry' | 'getStateById'> = {
    register(entry) {
      entries.set(entry.id, entry as DevframeViewIframe)
      states.set(entry.id, makeState(entry.id))
      return {
        update: (patch) => {
          entries.set(entry.id, { ...entries.get(entry.id)!, ...patch } as DevframeViewIframe)
        },
        dispose: () => {
          entries.delete(entry.id)
          states.delete(entry.id)
          if (selectedId === entry.id)
            selectedId = null
        },
      }
    },
    getStateById: id => states.get(id),
    async switchEntry(id) {
      const next = id ?? null
      if (next === selectedId)
        return false
      if (next !== null && !states.has(next))
        return false
      const prev = selectedId
      selectedId = next
      if (prev)
        states.get(prev)?.events.emit('entry:deactivated')
      if (next)
        states.get(next)?.events.emit('entry:activated')
      return true
    },
  }

  return {
    docks,
    entries,
    get selectedId() {
      return selectedId
    },
    select: (id: string) => docks.switchEntry(id),
  }
}

function createWindowStub() {
  const listeners = new Set<(ev: MessageEvent) => void>()
  return {
    target: {
      addEventListener: (_t: 'message', l: (ev: MessageEvent) => void) => listeners.add(l),
      removeEventListener: (_t: 'message', l: (ev: MessageEvent) => void) => listeners.delete(l),
    },
    emitFrame(data: unknown, origin = ORIGIN) {
      const ev = { data, origin } as MessageEvent
      for (const l of [...listeners]) l(ev)
    },
    count: () => listeners.size,
  }
}

function createIframeStub() {
  const posted: Array<{ msg: any, origin: string }> = []
  const iframe = {
    src: `${ORIGIN}/__nuxt/`,
    contentWindow: {
      postMessage: (msg: any, origin: string) => posted.push({ msg, origin }),
    },
  } as unknown as Pick<HTMLIFrameElement, 'contentWindow' | 'src'>
  return { iframe, posted }
}

function frameMsg(type: string, extra?: Record<string, unknown>) {
  return { channel: FRAME_NAV_CHANNEL, v: FRAME_NAV_VERSION, frameId: 'nuxt', from: 'frame', type, ...extra }
}

const TABS: FrameTab[] = [
  { id: 'modules', title: 'Modules', navTarget: { path: '/modules' } },
  { id: 'timeline', title: 'Timeline', navTarget: { path: '/timeline' } },
]

function boot(extra?: Partial<DevframeViewIframe>) {
  const docksStub = createDocksStub()
  const win = createWindowStub()
  const { iframe, posted } = createIframeStub()
  const adapter = attachFrameNavClient({
    frameId: 'nuxt',
    anchor: anchorEntry(extra),
    iframe,
    docks: docksStub.docks,
    window: win.target,
  })
  return { docksStub, win, iframe, posted, adapter }
}

const navPosts = (posted: Array<{ msg: any }>) => posted.filter(p => p.msg.type === 'navigate')

describe('attachFrameNavClient', () => {
  it('greets the shim with a hello on the anchor origin', () => {
    const { posted } = boot()
    expect(posted).toHaveLength(1)
    expect(posted[0].msg).toMatchObject({ channel: FRAME_NAV_CHANNEL, v: 1, frameId: 'nuxt', from: 'host', type: 'hello' })
    expect(posted[0].origin).toBe(ORIGIN)
  })

  it('materializes client-only member docks from ready, selecting current without echoing navigate', () => {
    const { docksStub, win, adapter, posted } = boot()
    win.emitFrame(frameMsg('ready', { tabs: TABS, current: 'modules' }))

    expect(adapter.ready).toBe(true)
    expect([...docksStub.entries.keys()]).toEqual(['nuxt:modules', 'nuxt:timeline'])
    // Member inherits frameId, anchor icon + groupId, carries its own navTarget.
    expect(docksStub.entries.get('nuxt:timeline')).toMatchObject({
      type: 'iframe',
      frameId: 'nuxt',
      icon: 'i-logos:nuxt',
      groupId: 'nuxt-group',
      navTarget: { path: '/timeline' },
    })
    // The initial `current` selects its dock but does not post a navigate.
    expect(docksStub.selectedId).toBe('nuxt:modules')
    expect(adapter.currentTabId).toBe('modules')
    expect(navPosts(posted)).toHaveLength(0)
  })

  it('posts navigate when the user selects a member, guarding the echo back', async () => {
    const { docksStub, win, adapter, posted } = boot()
    win.emitFrame(frameMsg('ready', { tabs: TABS, current: 'modules' }))

    await docksStub.select('nuxt:timeline')
    const navs = navPosts(posted)
    expect(navs).toHaveLength(1)
    expect(navs[0].msg).toMatchObject({ type: 'navigate', tabId: 'timeline', navTarget: { path: '/timeline' } })
    expect(adapter.currentTabId).toBe('timeline')

    // The shim's echoed `navigated` for the same tab must not re-post navigate.
    win.emitFrame(frameMsg('navigated', { tabId: 'timeline' }))
    expect(navPosts(posted)).toHaveLength(1)
    expect(docksStub.selectedId).toBe('nuxt:timeline')
  })

  it('moves the dock highlight on internal navigation without posting navigate', () => {
    const { docksStub, win, posted, adapter } = boot()
    win.emitFrame(frameMsg('ready', { tabs: TABS, current: 'modules' }))

    win.emitFrame(frameMsg('navigated', { tabId: 'timeline' }))
    expect(docksStub.selectedId).toBe('nuxt:timeline')
    expect(adapter.currentTabId).toBe('timeline')
    expect(navPosts(posted)).toHaveLength(0)
  })

  it('reconciles a manifest snapshot: removes a vanished tab and clears its selection', () => {
    const { docksStub, win, adapter } = boot()
    win.emitFrame(frameMsg('ready', { tabs: TABS, current: 'timeline' }))
    expect(docksStub.selectedId).toBe('nuxt:timeline')

    win.emitFrame(frameMsg('manifest', { tabs: [TABS[0]] }))
    expect([...docksStub.entries.keys()]).toEqual(['nuxt:modules'])
    expect(docksStub.selectedId).toBeNull()
    expect(adapter.currentTabId).toBeNull()
  })

  it('ignores messages from a foreign origin', () => {
    const { docksStub, win, adapter } = boot()
    win.emitFrame(frameMsg('ready', { tabs: TABS }), 'https://evil.example')
    expect(adapter.ready).toBe(false)
    expect(docksStub.entries.size).toBe(0)
  })

  it('ignores malformed / mis-tagged envelopes', () => {
    const { win, adapter } = boot()
    win.emitFrame({ channel: 'other', v: 1, frameId: 'nuxt', from: 'frame', type: 'ready', tabs: TABS })
    win.emitFrame({ channel: FRAME_NAV_CHANNEL, v: 2, frameId: 'nuxt', from: 'frame', type: 'ready', tabs: TABS })
    win.emitFrame({ channel: FRAME_NAV_CHANNEL, v: 1, frameId: 'other', from: 'frame', type: 'ready', tabs: TABS })
    win.emitFrame({ channel: FRAME_NAV_CHANNEL, v: 1, frameId: 'nuxt', from: 'host', type: 'ready', tabs: TABS })
    expect(adapter.ready).toBe(false)
  })

  it('dispose detaches the listener and removes every member dock', () => {
    const { docksStub, win, adapter } = boot()
    win.emitFrame(frameMsg('ready', { tabs: TABS }))
    expect(docksStub.entries.size).toBe(2)
    expect(win.count()).toBe(1)

    adapter.dispose()
    expect(win.count()).toBe(0)
    expect(docksStub.entries.size).toBe(0)
  })

  it('arms a handshake timeout that leaves the adapter un-ready with no shim', () => {
    vi.useFakeTimers()
    try {
      const { adapter, docksStub } = boot()
      vi.advanceTimersByTime(3000)
      expect(adapter.ready).toBe(false)
      expect(docksStub.entries.size).toBe(0)
    }
    finally {
      vi.useRealTimers()
    }
  })
})
