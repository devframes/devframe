import { HUB_EVENTS } from '@devframes/hub/constants'
import { createInPageChannelRelay } from 'devframe/in-page-channel'

const CONNECT = HUB_EVENTS.postMessage.inspectedPage
const TIMEOUT = 12_000
type Method = 'prepare' | 'activate' | 'deactivate'

export interface InspectedPageTarget {
  prepare: (entryId: string) => Promise<boolean>
  activate: (entryId: string) => Promise<boolean>
  deactivate: (entryId: string) => Promise<boolean>
  onSelection: (listener: (entryId: string | null) => void) => () => void
  onDisconnect: (listener: () => void) => () => void
  close: () => void
}

interface InspectedPageHost {
  prepare: (entryId: string) => Promise<boolean>
  activate: (entryId: string) => Promise<boolean>
  deactivate: (entryId: string) => Promise<boolean>
  onSelection: (listener: (entryId: string | null) => void) => () => void
}

function channelTransport(port: MessagePort) {
  return {
    postMessage(data: unknown) {
      port.postMessage({ type: 'channel', data })
    },
    onMessage(handler: (data: unknown) => void) {
      const listener = (event: MessageEvent) => {
        if (event.data?.type === 'channel')
          handler(event.data.data)
      }
      port.addEventListener('message', listener)
      return () => port.removeEventListener('message', listener)
    },
  }
}

/**
 * Accept a dedicated transport supplied by a hub UI provider's browser adapter.
 * The adapter owns tab/document routing; this endpoint only accepts a port
 * delivered by this host page and operates on registered dock entries.
 */
export function installInspectedPageHost(host: InspectedPageHost, win: Window = window): () => void {
  const sessions = new Map<string, () => void>()
  // Replacement connections share the action queue, including teardown. An
  // older pending activation must finish and deactivate before its successor.
  let operations = Promise.resolve()
  const connect = (event: MessageEvent) => {
    if (event.source !== win || event.origin !== win.location.origin)
      return
    const data = event.data
    if (data?.type !== CONNECT || typeof data.session !== 'string' || !data.session || !event.ports[0])
      return
    sessions.get(data.session)?.()
    const port = event.ports[0]
    let activeEntry: string | undefined
    let closed = false
    const stopRelay = createInPageChannelRelay({ role: 'page', window: win, transport: channelTransport(port) })
    const stopSelection = host.onSelection(entryId => port.postMessage({ type: 'selection', entryId }))
    function close() {
      if (closed)
        return
      closed = true
      stopSelection()
      stopRelay()
      port.removeEventListener('message', receive)
      port.postMessage({ type: 'disconnect' })
      port.close()
      sessions.delete(data.session)
      // Queue teardown after in-flight activation so closing the extension
      // cannot leave an inspector enabled after its asynchronous script loads.
      operations = operations.then(async () => {
        if (activeEntry)
          await host.deactivate(activeEntry)
      }).catch(() => {})
    }
    function receive(message: MessageEvent) {
      const request = message.data
      if (request?.type === 'disconnect') {
        close()
        return
      }
      if (request?.type !== 'request' || typeof request.id !== 'string' || typeof request.entryId !== 'string')
        return
      if (!['prepare', 'activate', 'deactivate'].includes(request.method))
        return
      const method = request.method as Method
      operations = operations.then(async () => {
        if (closed)
          return
        try {
          const result = await host[method](request.entryId)
          if (method === 'activate' && result)
            activeEntry = request.entryId
          if (method === 'deactivate' && activeEntry === request.entryId)
            activeEntry = undefined
          if (!closed)
            port.postMessage({ type: 'response', id: request.id, result })
        }
        catch (error) {
          if (!closed)
            port.postMessage({ type: 'response', id: request.id, error: error instanceof Error ? error.message : String(error) })
        }
      })
    }
    sessions.set(data.session, close)
    port.addEventListener('message', receive)
    port.start()
    port.postMessage({ type: 'ready' })
  }
  win.addEventListener('message', connect)
  const dispose = () => {
    win.removeEventListener('message', connect)
    win.removeEventListener('pagehide', dispose)
    for (const close of [...sessions.values()])
      close()
  }
  win.addEventListener('pagehide', dispose)
  return dispose
}

/** A remote target is explicit and fail-closed: never execute its scripts locally. */
export async function connectInspectedPage(win: Window = window): Promise<InspectedPageTarget | undefined> {
  const query = new URLSearchParams(win.location.search)
  const session = query.get('devframe-inspected-page')
  if (!session)
    return undefined
  const parentOrigin = query.get('devframe-parent-origin')
  if (!parentOrigin || parentOrigin === '*' || parentOrigin === 'null' || win.parent === win)
    throw new Error('The inspected-page adapter is unavailable. Reopen the browser DevTools panel.')
  const { port1: port, port2 } = new MessageChannel()
  const selectionListeners = new Set<(id: string | null) => void>()
  const disconnectListeners = new Set<() => void>()
  const pending = new Map<string, { resolve: (value: boolean) => void, reject: (reason: Error) => void, timer: ReturnType<typeof setTimeout> }>()
  let sequence = 0
  let closed = false
  let stopRelay = () => {}
  let readyResolve!: () => void
  let readyReject!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve
    readyReject = reject
  })
  const timeout = setTimeout(() => {
    readyReject(new Error('The inspected page does not support the DevTools bridge. Update the hub UI package and reload the page.'))
    close()
  }, TIMEOUT)
  function close() {
    if (closed)
      return
    closed = true
    clearTimeout(timeout)
    stopRelay()
    readyReject(new Error('The inspected page disconnected. Reopen the browser DevTools panel.'))
    for (const call of pending.values()) {
      clearTimeout(call.timer)
      call.reject(new Error('The inspected page disconnected.'))
    }
    pending.clear()
    port.postMessage({ type: 'disconnect' })
    port.close()
    win.removeEventListener('pagehide', close)
    for (const listener of disconnectListeners)
      listener()
  }
  function receiveResponse(data: { id: string, result?: unknown, error?: unknown }) {
    const call = pending.get(data.id)
    if (!call)
      return
    pending.delete(data.id)
    clearTimeout(call.timer)
    if (typeof data.error === 'string')
      call.reject(new Error(data.error))
    else
      call.resolve(data.result === true)
  }
  port.addEventListener('message', (event) => {
    const data = event.data
    if (closed)
      return
    if (data?.type === 'ready') {
      clearTimeout(timeout)
      readyResolve()
    }
    else if (data?.type === 'response' && typeof data.id === 'string') {
      receiveResponse(data)
    }
    else if (data?.type === 'selection' && (data.entryId === null || typeof data.entryId === 'string')) {
      for (const listener of selectionListeners)
        listener(data.entryId)
    }
    else if (data?.type === 'disconnect' || data?.type === 'error') {
      if (typeof data.message === 'string')
        readyReject(new Error(data.message))
      close()
    }
  })
  port.start()
  win.addEventListener('pagehide', close)
  try {
    win.parent.postMessage({ type: CONNECT, session }, parentOrigin, [port2])
  }
  catch (error) {
    readyReject(error instanceof Error ? error : new Error(String(error)))
    port2.close()
    close()
  }
  await ready
  stopRelay = createInPageChannelRelay({ role: 'panel', window: win, transport: channelTransport(port) })
  const request = (method: Method, entryId: string): Promise<boolean> => {
    if (closed)
      return Promise.reject(new Error('The inspected page disconnected.'))
    return new Promise((resolve, reject) => {
      const id = String(++sequence)
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`The inspected page did not answer the ${method} request.`))
        // The operation may still complete in the inspected document. Closing
        // queues its teardown there, so a late activation cannot stay enabled.
        close()
      }, TIMEOUT)
      pending.set(id, { resolve, reject, timer })
      port.postMessage({ type: 'request', id, method, entryId })
    })
  }
  return {
    prepare: id => request('prepare', id),
    activate: id => request('activate', id),
    deactivate: id => request('deactivate', id),
    onSelection(listener) {
      selectionListeners.add(listener)
      return () => selectionListeners.delete(listener)
    },
    onDisconnect(listener) {
      disconnectListeners.add(listener)
      return () => disconnectListeners.delete(listener)
    },
    close,
  }
}
