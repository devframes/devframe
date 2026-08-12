import type { Peer } from 'crossws'
import type { StartedServer } from 'devframe/internal'
import type { DevframeAuthHandler } from 'devframe/node/auth'
import type { ConnectionMeta, DevframeNodeContext, DevframeNodeRpcSession } from 'devframe/types'
import type { H3 } from 'h3'
import { createServer } from 'node:http'
import { isIP } from 'node:net'
import { createContextRpcServer } from 'devframe/internal'
import { getInternalContext } from 'devframe/node/hub-internals'
import { attachWsRpcTransport } from 'devframe/rpc/transports/ws-server'
import { H3 as H3App, toNodeHandler } from 'h3'

/** Loopback / wildcard binds aren't dialable as-is — advertise `localhost`. */
function formatHostForUrl(host: string): string {
  const dialable = ['0.0.0.0', '127.0.0.1', '::', ''].includes(host) ? 'localhost' : host
  return isIP(dialable) === 6 ? `[${dialable}]` : dialable
}

export interface ServeTestContextOptions {
  /** The devframe node context whose registered RPC functions to serve. */
  context: DevframeNodeContext
  /** Bind host. Default: `localhost`. */
  host?: string
  /** Listening port (`0` binds an ephemeral one). */
  port: number
  /** h3 app to serve (SPA + connection meta). A fresh empty one is used when omitted. */
  app?: H3
  /** Auth intent, same contract as the shell binding: `false` auto-trusts. */
  auth?: boolean | DevframeAuthHandler
  /** Called once per new WS connection, right after its session is created. */
  onPeerConnect?: (peer: Peer, session: DevframeNodeRpcSession) => void
}

/**
 * Stand up a real HTTP + WebSocket RPC server for a hand-built devframe
 * context — the in-process test counterpart to the binding `initDevframe` /
 * `initHub` perform internally. Test harnesses that need a live origin,
 * direct `ctx` access, an injected fake host, or a custom `cwd` build their
 * context by hand and serve it through this helper; production code reaches
 * for `initDevframe` / `initHub` / `createDevServer` instead.
 */
export async function serveTestContext(options: ServeTestContextOptions): Promise<StartedServer> {
  const { context, port } = options
  const bindHost = options.host ?? 'localhost'
  const app = options.app ?? new H3App()
  const httpServer = createServer(toNodeHandler(app))
  const rpcHost = context.rpc as unknown as {
    definitions: Map<string, { name: string, jsonSerializable?: boolean }>
  }

  const { rpcGroup, onConnected, onDisconnected } = createContextRpcServer({
    context,
    auth: options.auth,
    onPeerConnect: options.onPeerConnect,
  })

  const { ws, close: closeWs } = attachWsRpcTransport(rpcGroup, {
    server: httpServer,
    destroyUnmatched: true,
    onConnected,
    onDisconnected,
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error)
    httpServer.once('error', onError)
    httpServer.listen(port, bindHost, () => {
      httpServer.removeListener('error', onError)
      resolve()
    })
  })

  const address = httpServer.address()
  const resolvedPort = typeof address === 'object' && address ? address.port : port
  const origin = `http://${formatHostForUrl(bindHost)}:${resolvedPort}`

  // Publish the dialable socket URL on the context, mirroring the shell's own
  // binding, so surfaces that hand out a complete endpoint work in tests too.
  const wsUrl = `ws://${formatHostForUrl(bindHost)}:${resolvedPort}`
  getInternalContext(context).wsEndpoint = { url: wsUrl }

  function connectionMeta(): ConnectionMeta {
    const jsonSerializableMethods: string[] = []
    for (const def of rpcHost.definitions.values()) {
      if (def.jsonSerializable === true)
        jsonSerializableMethods.push(def.name)
    }
    return { backend: 'websocket', websocket: {}, jsonSerializableMethods }
  }

  return {
    origin,
    port: resolvedPort,
    app,
    ws,
    rpcGroup,
    connectionMeta,
    async close() {
      await closeWs()
      await new Promise<void>(r => httpServer.close(() => r()))
      if (getInternalContext(context).wsEndpoint?.url === wsUrl)
        getInternalContext(context).wsEndpoint = undefined
    },
  }
}
