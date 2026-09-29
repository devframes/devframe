export function fakeWindow(origin = 'https://app.test', search = '') {
  const listeners = new Map<string, Set<(event: MessageEvent) => void>>()
  const storage = new Map<string, string>()
  const win = {
    location: { origin, search },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    parent: undefined as Window | undefined,
    opener: null,
    sender: undefined as Window | undefined,
    addEventListener(type: string, fn: (event: MessageEvent) => void) {
      if (!listeners.has(type))
        listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    },
    removeEventListener(type: string, fn: (event: MessageEvent) => void) {
      listeners.get(type)?.delete(fn)
    },
    postMessage(data: unknown, targetOrigin: string, ports: MessagePort[] = []) {
      if (targetOrigin !== origin && targetOrigin !== '*')
        return
      win.dispatch('message', { data, origin: win.sender!.location.origin, source: win.sender!, ports })
    },
    dispatch(type: string, event: Partial<MessageEvent>) {
      queueMicrotask(() => {
        for (const listener of listeners.get(type) ?? [])
          listener(event as MessageEvent)
      })
    },
    listeners,
  }
  // eslint-disable-next-line slop/no-chained-type-assertions -- the fake supplies the browser Window boundary used by the public bridge APIs
  const window = win as unknown as Window
  win.parent = window
  win.sender = window
  return { win, window }
}
