import type { Server as NodeHttpServer } from 'node:http'
import { createServer } from 'node:http'

function listen(server: NodeHttpServer, port: number, host: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error)
    // Without this listener a failed bind emits `error` with nobody
    // attached (an uncaughtException) and the `listen` callback never
    // fires, so this promise never settles.
    server.once('error', onError)
    server.listen(port, host, () => {
      server.removeListener('error', onError)
      resolve()
    })
  })
}

/** Errors meaning the machine has no such loopback address to bind. */
const NO_LOOPBACK_ADDRESS = new Set(['EADDRNOTAVAIL', 'EAFNOSUPPORT'])

/** Whether a failed bind means another process holds the port. */
export function isAddressInUse(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'EADDRINUSE'
}

/**
 * Listen on `host`, and when that is `localhost`, on the other loopback
 * address too. `listen(port, 'localhost')` binds only the first address
 * `localhost` resolves to (`::1` on most current Linux and macOS setups),
 * while a browser dials the page's own hostname, so a page opened on
 * `127.0.0.1` would be refused, or reach another process that holds
 * `127.0.0.1` on the same port. The twin server hands its traffic to
 * `server`. If another process holds the twin address, fail like a taken
 * port (`EADDRINUSE`), so pages on that address never reach a different
 * server. A machine without that address family skips the twin. Resolves to
 * a closer for the twin.
 */
export async function listenWithLoopbackTwin(server: NodeHttpServer, port: number, host: string): Promise<() => Promise<void>> {
  await listen(server, port, host)
  const bound = server.address()
  if (host !== 'localhost' || !bound || typeof bound === 'string')
    return async () => {}
  const twin = createServer()
  twin.on('request', (req, res) => server.emit('request', req, res))
  twin.on('upgrade', (req, socket, head) => server.emit('upgrade', req, socket, head))
  try {
    await listen(twin, bound.port, bound.family === 'IPv6' ? '127.0.0.1' : '::1')
    return () => new Promise<void>(r => twin.close(() => r()))
  }
  catch (error) {
    if (NO_LOOPBACK_ADDRESS.has((error as NodeJS.ErrnoException).code ?? ''))
      return async () => {}
    await new Promise<void>(r => server.close(() => r()))
    throw error
  }
}
