import type { DevframeClientHost, DevframeClientHostOptions } from '@devframes/hub/client'
import { createDevframeClientHost } from '@devframes/hub/client'

export type { DevframeClientHost, DevframeClientHostOptions } from '@devframes/hub/client'

/** Default hub mount base — mirrors `@devframes/hub`'s `DEVFRAMES_HUB_BASE`. */
const DEVFRAMES_HUB_BASE = '/__devframes/'

export interface MountDevframeHubClientOptions extends DevframeClientHostOptions {
  /**
   * Hub mount base to connect to. Forwarded as `connect.baseURL` when no
   * `rpc` / `connect.baseURL` is supplied.
   *
   * @default '/__devframes/'
   */
  base?: string
}

/**
 * Boot the devframes-hub **client runtime** in the host page — the browser
 * half of {@link import('./hub').viteDevframeHub}. Connects RPC to the hub
 * (defaulting `base` to `/__devframes/`), assembles the shared
 * `DevframeClientContext`, and imports each dock's client script into the
 * page. A thin default-applying wrapper over `@devframes/hub/client`'s
 * `createDevframeClientHost`.
 *
 * Only needed when you render your own dock UI (or override the hub's `ui`).
 * With the default `@devframes/hub-ui`, its injected `embedded.js` boots the
 * client for you, so the host page needs no client code.
 */
export function mountDevframeHubClient(
  options: MountDevframeHubClientOptions = {},
): Promise<DevframeClientHost> {
  const { base = DEVFRAMES_HUB_BASE, connect, ...rest } = options
  return createDevframeClientHost({
    ...rest,
    ...(rest.rpc ? {} : { connect: { baseURL: base, ...connect } }),
  })
}
