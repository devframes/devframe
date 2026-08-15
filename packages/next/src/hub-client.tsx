'use client'

import type { DevframeClientHost, DevframeClientHostOptions } from '@devframes/hub/client'
import { createDevframeClientHost } from '@devframes/hub/client'
import { DEVFRAMES_HUB_BASE } from '@devframes/hub/constants'
import { useEffect, useState } from 'react'

export type { DevframeClientHost, DevframeClientHostOptions } from '@devframes/hub/client'

export interface UseDevframeHubClientOptions extends DevframeClientHostOptions {
  /**
   * Hub mount base to connect to. Forwarded as `connect.baseURL` when no
   * `rpc` / `connect.baseURL` is supplied.
   *
   * @default '/__devframes/'
   */
  base?: string
}

/**
 * Boot the devframes-hub **client runtime** inside a React (Next.js) page —
 * the browser half of {@link import('./hub').nextDevframeHub}. Connects RPC to
 * the hub (defaulting `base` to `/__devframes/`), assembles the shared
 * `DevframeClientContext`, imports each dock's client script into the page,
 * and disposes on unmount. Returns the {@link DevframeClientHost} once ready
 * (`null` while connecting).
 *
 * Only needed when you render your own dock UI (or override the hub's `ui`).
 * With the default `@devframes/hub-ui`, its injected `embedded.js` boots the
 * client for you, so the page needs no client code.
 *
 * `renderers` is read once on mount; memoize it at the call site if it isn't a
 * stable reference.
 */
export function useDevframeHubClient(
  options: UseDevframeHubClientOptions = {},
): DevframeClientHost | null {
  const { base = DEVFRAMES_HUB_BASE, rpc, connect } = options
  const [host, setHost] = useState<DevframeClientHost | null>(null)

  useEffect(() => {
    let disposed = false
    let created: DevframeClientHost | undefined

    void createDevframeClientHost({
      ...options,
      ...(rpc ? { rpc } : { connect: { baseURL: base, ...connect } }),
    }).then((next) => {
      if (disposed) {
        next.dispose()
        return
      }
      created = next
      setHost(next)
    })

    return () => {
      disposed = true
      created?.dispose()
      setHost(null)
    }
    // Reconnect only when the connection target changes; `renderers` and the
    // rest are captured on mount (documented above).
  }, [base, rpc])

  return host
}
