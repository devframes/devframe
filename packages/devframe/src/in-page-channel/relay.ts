import type { InPageChannelHandshakeMessage } from './protocol'
import { nanoid } from 'devframe/utils/nanoid'
import { IN_PAGE_CHANNEL_TAG, IN_PAGE_CHANNEL_VERSION, isHandshakeMessage } from './protocol'

/** A message transport bound to one inspected document and one hub UI provider document. */
export interface InPageChannelRelayTransport {
  postMessage: (data: unknown) => void
  onMessage: (handler: (data: unknown) => void) => () => void
}

export interface InPageChannelRelayOptions {
  /** `panel` runs in the hub UI provider document containing panels; `page` in the inspected document. */
  role: 'panel' | 'page'
  window?: Window
  transport: InPageChannelRelayTransport
}

interface RelayMessage {
  channel: typeof IN_PAGE_CHANNEL_TAG
  relay: 1
  id: string
  kind: 'open' | 'grant' | 'data' | 'close'
  handshake?: InPageChannelHandshakeMessage
  data?: unknown
}

interface RelayConnection {
  hello: InPageChannelHandshakeMessage
  source?: Window
  port?: MessagePort
  detach?: () => void
}

function validHandshake(data: unknown, kind: 'hello' | 'grant'): data is InPageChannelHandshakeMessage {
  return isHandshakeMessage(data)
    && data.v === IN_PAGE_CHANNEL_VERSION
    && data.kind === kind
    && (data.instanceId === undefined || typeof data.instanceId === 'string')
}

function isRelayMessage(data: unknown): data is RelayMessage {
  if (!data || typeof data !== 'object')
    return false
  const message = data as Partial<RelayMessage>
  return message.channel === IN_PAGE_CHANNEL_TAG && message.relay === 1
    && typeof message.id === 'string'
    && (message.kind === 'data' || message.kind === 'close'
      || (message.kind === 'open' && validHandshake(message.handshake, 'hello'))
      || (message.kind === 'grant' && validHandshake(message.handshake, 'grant')))
}

function isDescendant(source: Window, ancestor: Window): boolean {
  try {
    let current = source
    while (current.parent && current.parent !== current) {
      current = current.parent
      if (current === ancestor)
        return true
    }
  }
  catch {
    // An inaccessible ancestor cannot establish the panel's ownership.
  }
  return false
}

/**
 * Relay existing in-page handshakes and their dedicated ports across a transport
 * supplied by a hub UI provider. The provider authenticates and binds that
 * transport to one inspected document, and disposes both relays on navigation.
 * Panels and page scripts keep their existing channel APIs unchanged.
 */
export function createInPageChannelRelay(options: InPageChannelRelayOptions): () => void {
  const win = options.window ?? window
  const origin = win.location.origin
  if (!origin || origin === 'null')
    throw new Error('An in-page channel relay requires a document with an origin')
  const connections = new Map<string, RelayConnection>()
  let disposed = false

  function send(message: Omit<RelayMessage, 'channel' | 'relay'>): void {
    try {
      options.transport.postMessage({ channel: IN_PAGE_CHANNEL_TAG, relay: 1, ...message })
    }
    catch {
      close(message.id, false)
    }
  }

  function close(id: string, notify = true): void {
    const connection = connections.get(id)
    if (!connection)
      return
    connections.delete(id)
    connection.detach?.()
    // Endpoints recognize bye immediately, including browsers where closing
    // the other port does not dispatch a close event.
    try {
      connection.port?.postMessage({ __dfIpc: 'bye' })
    }
    catch {
      // A detached port is already disconnected.
    }
    connection.port?.close()
    if (notify)
      send({ id, kind: 'close' })
  }

  function attach(id: string, connection: RelayConnection, port: MessagePort): void {
    connection.port = port
    const onMessage = (event: MessageEvent): void => {
      send({ id, kind: 'data', data: event.data })
      if (event.data?.__dfIpc === 'bye')
        close(id)
    }
    const onClose = (): void => close(id)
    port.addEventListener('message', onMessage)
    port.addEventListener('close', onClose)
    connection.detach = () => {
      port.removeEventListener('message', onMessage)
      port.removeEventListener('close', onClose)
    }
    port.start()
  }

  function matches(grant: InPageChannelHandshakeMessage, hello: InPageChannelHandshakeMessage): boolean {
    return grant.name === hello.name && grant.panelId === hello.panelId
      && typeof grant.instanceId === 'string'
      && (!hello.instanceId || grant.instanceId === hello.instanceId)
  }

  function sameHello(left: InPageChannelHandshakeMessage, right: InPageChannelHandshakeMessage): boolean {
    return left.name === right.name && left.panelId === right.panelId && left.instanceId === right.instanceId
  }

  function onPanelHello(event: MessageEvent): void {
    if (!validHandshake(event.data, 'hello') || !event.source
      || !isDescendant(event.source as Window, win)) {
      return
    }
    const hello = event.data
    let id: string | undefined
    for (const [key, connection] of connections) {
      if (connection.source === event.source && connection.hello.panelId === hello.panelId
        && connection.hello.name === hello.name && connection.hello.instanceId === hello.instanceId) {
        if (connection.port)
          return
        id = key
        break
      }
    }
    id ??= nanoid()
    connections.set(id, { hello, source: event.source as Window })
    send({ id, kind: 'open', handshake: hello })
  }

  function onPageGrant(event: MessageEvent): void {
    if (event.source !== win || !validHandshake(event.data, 'grant') || !event.ports[0])
      return
    for (const [id, connection] of connections) {
      if (!connection.port && matches(event.data, connection.hello)) {
        attach(id, connection, event.ports[0])
        send({ id, kind: 'grant', handshake: event.data })
        return
      }
    }
  }

  const onWindowMessage = (event: MessageEvent): void => {
    if (disposed || event.origin !== origin)
      return
    if (options.role === 'panel')
      onPanelHello(event)
    else
      onPageGrant(event)
  }

  function forwardHello(id: string, hello: InPageChannelHandshakeMessage): void {
    const connection = connections.get(id)
    if (connection?.port || (connection && !sameHello(connection.hello, hello)))
      return
    connections.set(id, { hello })
    win.postMessage(hello, origin)
  }

  const unsubscribe = options.transport.onMessage((data) => {
    if (disposed || !isRelayMessage(data))
      return
    const connection = connections.get(data.id)
    if (data.kind === 'open' && options.role === 'page') {
      forwardHello(data.id, data.handshake!)
    }
    else if (data.kind === 'grant' && options.role === 'panel' && connection
      && !connection.port && matches(data.handshake!, connection.hello)) {
      const channel = new MessageChannel()
      attach(data.id, connection, channel.port1)
      try {
        connection.source!.postMessage(data.handshake, origin, [channel.port2])
      }
      catch {
        channel.port2.close()
        close(data.id)
      }
    }
    else if (data.kind === 'data') {
      try {
        connection?.port?.postMessage(data.data)
      }
      catch {
        close(data.id)
      }
    }
    else if (data.kind === 'close') {
      close(data.id, false)
    }
  })
  win.addEventListener('message', onWindowMessage)

  return () => {
    if (disposed)
      return
    disposed = true
    win.removeEventListener('message', onWindowMessage)
    unsubscribe()
    for (const id of connections.keys())
      close(id)
  }
}
