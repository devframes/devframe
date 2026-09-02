import type { FrameLocationTarget, FrameLocationWindow } from '../frame-location'
import { describe, expect, it, vi } from 'vitest'
import { watchFrameLocation } from '../frame-location'

type Listener = () => void

interface FakeFrame {
  iframe: FrameLocationTarget
  /** Emit a same-document navigation the way a router would. */
  pushState: (href: string) => void
  replaceState: (href: string) => void
  /**
   * Navigate without going through the frame's current `pushState`, as a router
   * that captured the method before the watch attached does, which no wrapper sees.
   */
  pushStateBypassingWrapper: (href: string) => void
  /** Emit the Navigation API's post-commit notification. */
  emitCurrentEntryChange: () => void
  /** Emit a browser-driven same-document navigation. */
  emit: (type: 'popstate' | 'hashchange', href: string) => void
  /** Swap in a new document (new window, new `history`) and fire `load`. */
  load: (href: string) => void
  /** Whether the frame's `history` methods are the ones it started with. */
  isHistoryPristine: () => boolean
  /** Whether every listener the watcher attached has been removed. */
  isDetached: () => boolean
}

/**
 * A frame standing in for a same-origin iframe. `navigation: true` gives it the
 * Navigation API on top of `history`, the way a browser that ships it does.
 */
function fakeFrame(initialHref: string, options: { navigation?: boolean, crossOrigin?: boolean } = {}): FakeFrame {
  const loadListeners = new Set<Listener>()
  let win: FrameLocationWindow
  let href = initialHref
  let winListeners: Map<string, Set<Listener>>
  let navListeners: Set<Listener>
  let pristinePush: (...args: any[]) => void
  let pristineReplace: (...args: any[]) => void

  function createWindow(): void {
    const listeners = new Map<string, Set<Listener>>([['popstate', new Set()], ['hashchange', new Set()]])
    const nav = new Set<Listener>()
    const history = {
      pushState: (...args: any[]) => {
        href = String(args[2])
      },
      replaceState: (...args: any[]) => {
        href = String(args[2])
      },
    }
    pristinePush = history.pushState
    pristineReplace = history.replaceState
    winListeners = listeners
    navListeners = nav
    win = {
      get location() {
        if (options.crossOrigin)
          throw new DOMException('cross-origin', 'SecurityError')
        return {
          get href() {
            return href
          },
        }
      },
      history,
      navigation: options.navigation
        ? {
            addEventListener: (_type, listener) => void nav.add(listener),
            removeEventListener: (_type, listener) => void nav.delete(listener),
          }
        : undefined,
      addEventListener: (type, listener) => void listeners.get(type)!.add(listener),
      removeEventListener: (type, listener) => void listeners.get(type)!.delete(listener),
    }
  }

  createWindow()

  const iframe: FrameLocationTarget = {
    get contentWindow() {
      return win
    },
    addEventListener: (_type, listener) => void loadListeners.add(listener),
    removeEventListener: (_type, listener) => void loadListeners.delete(listener),
  }

  function emitCurrentEntryChange(): void {
    for (const listener of [...navListeners]) listener()
  }

  return {
    iframe,
    emitCurrentEntryChange,
    pushState: (next) => {
      win.history!.pushState({}, '', next)
    },
    replaceState: (next) => {
      win.history!.replaceState({}, '', next)
    },
    pushStateBypassingWrapper: (next) => {
      pristinePush({}, '', next)
      emitCurrentEntryChange()
    },
    emit: (type, next) => {
      href = next
      for (const listener of [...winListeners.get(type)!]) listener()
    },
    load: (next) => {
      createWindow()
      href = next
      for (const listener of [...loadListeners]) listener()
    },
    isHistoryPristine: () =>
      win.history!.pushState === pristinePush && win.history!.replaceState === pristineReplace,
    isDetached: () =>
      loadListeners.size === 0
      && navListeners.size === 0
      && [...winListeners.values()].every(set => set.size === 0),
  }
}

describe('watchFrameLocation', () => {
  it('reports pushState and replaceState by wrapping them, and restores them on dispose', () => {
    const frame = fakeFrame('http://localhost/app/')
    const onChange = vi.fn()
    const dispose = watchFrameLocation({ iframe: frame.iframe, onChange, initial: 'http://localhost/app/' })

    expect(onChange).not.toHaveBeenCalled()
    expect(frame.isHistoryPristine()).toBe(false)

    frame.pushState('http://localhost/app/routes')
    frame.replaceState('http://localhost/app/routes?tab=2')
    expect(onChange.mock.calls.map(c => c[0])).toEqual([
      'http://localhost/app/routes',
      'http://localhost/app/routes?tab=2',
    ])

    dispose()
    expect(frame.isHistoryPristine()).toBe(true)
    expect(frame.isDetached()).toBe(true)

    frame.pushState('http://localhost/app/after-dispose')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('the wrapper still performs the navigation it wraps', () => {
    const frame = fakeFrame('http://localhost/app/')
    watchFrameLocation({ iframe: frame.iframe, onChange: () => {}, initial: 'http://localhost/app/' })
    frame.pushState('http://localhost/app/moved')
    expect(frame.iframe.contentWindow!.location.href).toBe('http://localhost/app/moved')
  })

  it('reports pushState where the Navigation API exists too, without depending on it', () => {
    // Whether `pushState` fires a Navigation API event is not something to bet a
    // stale address bar on, so the wrapper stays in place either way.
    const frame = fakeFrame('http://localhost/app/', { navigation: true })
    const onChange = vi.fn()
    watchFrameLocation({ iframe: frame.iframe, onChange, initial: 'http://localhost/app/' })

    frame.pushState('http://localhost/app/routes')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith('http://localhost/app/routes')
  })

  it('catches a navigation the wrapper cannot see, via currententrychange', () => {
    const frame = fakeFrame('http://localhost/app/', { navigation: true })
    const onChange = vi.fn()
    watchFrameLocation({ iframe: frame.iframe, onChange, initial: 'http://localhost/app/' })

    frame.pushStateBypassingWrapper('http://localhost/app/router-owned')
    expect(onChange).toHaveBeenCalledExactlyOnceWith('http://localhost/app/router-owned')
  })

  it('reports a navigation heard from two sources once', () => {
    const frame = fakeFrame('http://localhost/app/', { navigation: true })
    const onChange = vi.fn()
    watchFrameLocation({ iframe: frame.iframe, onChange, initial: 'http://localhost/app/' })

    // A browser where `pushState` does fire the Navigation API event: the
    // wrapper and the listener both report, and the href dedupe absorbs it.
    frame.pushState('http://localhost/app/routes')
    frame.emitCurrentEntryChange()
    expect(onChange).toHaveBeenCalledExactlyOnceWith('http://localhost/app/routes')
  })

  it('reports back/forward and hash routing', () => {
    const frame = fakeFrame('http://localhost/app/')
    const onChange = vi.fn()
    watchFrameLocation({ iframe: frame.iframe, onChange, initial: 'http://localhost/app/' })

    frame.emit('popstate', 'http://localhost/app/back')
    frame.emit('hashchange', 'http://localhost/app/back#section')
    expect(onChange.mock.calls.map(c => c[0])).toEqual([
      'http://localhost/app/back',
      'http://localhost/app/back#section',
    ])
  })

  it('re-subscribes after a document load, whose window and history are new', () => {
    const frame = fakeFrame('http://localhost/app/')
    const onChange = vi.fn()
    watchFrameLocation({ iframe: frame.iframe, onChange, initial: 'http://localhost/app/' })

    frame.load('http://localhost/app/reloaded')
    expect(onChange).toHaveBeenLastCalledWith('http://localhost/app/reloaded')

    // The pre-load subscription died with the old window; only a fresh one on
    // the new `history` object keeps soft navigations reported.
    frame.pushState('http://localhost/app/reloaded/deep')
    expect(onChange).toHaveBeenLastCalledWith('http://localhost/app/reloaded/deep')
  })

  it('reports an already-navigated frame on attach, but never the blank placeholder', () => {
    const booting = fakeFrame('about:blank')
    const onBoot = vi.fn()
    watchFrameLocation({ iframe: booting.iframe, onChange: onBoot, initial: 'http://localhost/app/' })
    expect(onBoot).not.toHaveBeenCalled()

    // A frame that soft-navigated while no view was watching it (a shared frame
    // between dock switches) is corrected as soon as the next watch attaches.
    const live = fakeFrame('http://localhost/app/elsewhere')
    const onAttach = vi.fn()
    watchFrameLocation({ iframe: live.iframe, onChange: onAttach, initial: 'http://localhost/app/' })
    expect(onAttach).toHaveBeenCalledExactlyOnceWith('http://localhost/app/elsewhere')
  })

  it('reports each distinct href once', () => {
    const frame = fakeFrame('http://localhost/app/')
    const onChange = vi.fn()
    watchFrameLocation({ iframe: frame.iframe, onChange, initial: 'http://localhost/app/' })

    frame.emit('popstate', 'http://localhost/app/same')
    frame.emit('popstate', 'http://localhost/app/same')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('observes nothing on a cross-origin frame, and does not throw', () => {
    const frame = fakeFrame('http://elsewhere.test/app/', { crossOrigin: true })
    const onChange = vi.fn()
    const dispose = watchFrameLocation({ iframe: frame.iframe, onChange, initial: 'http://localhost/app/' })

    expect(onChange).not.toHaveBeenCalled()
    expect(() => frame.load('http://elsewhere.test/app/other')).not.toThrow()
    expect(onChange).not.toHaveBeenCalled()
    expect(() => dispose()).not.toThrow()
  })

  it('tolerates a frame with no contentWindow', () => {
    const onChange = vi.fn()
    const iframe: FrameLocationTarget = {
      contentWindow: null,
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    expect(() => watchFrameLocation({ iframe, onChange })()).not.toThrow()
    expect(onChange).not.toHaveBeenCalled()
  })
})
