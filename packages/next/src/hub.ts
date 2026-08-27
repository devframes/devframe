import type { DevframeHubUi, HubInstance, InitHubOptions } from '@devframes/hub/initiate'
import { DEVFRAMES_HUB_BASE, normalizeHubBase } from '@devframes/hub/constants'
import { initHub } from '@devframes/hub/initiate'

// The "bring your own DevframeHost" seam for `initHub({ context })`.
export type {
  CreateDevframeNextHostOptions,
  DevframeNextHost,
  DevframeNextHostMcpOptions,
} from './host'
export { createDevframeNextHost } from './host'

export interface NextDevframeHubOptions {
  /**
   * Mount base the hub answers under — every frame lives at `<base><id>/`,
   * so the App Router needs one catch-all route under it. Default:
   * `/__devframes/`.
   */
  base?: string
  /**
   * Pin the side-car RPC/WS port. Next route handlers can't accept WebSocket
   * upgrades, so the socket always runs on a side-car server; default walks a
   * free port near 9777.
   */
  port?: number
  /** Bind host for the side-car server. Default: `localhost`. */
  host?: string
  /** Working directory for the hub context. Default: `process.cwd()`. */
  cwd?: string
  /**
   * Devframes to mount. Load built-in plugin packages through a
   * bundler-ignored dynamic `import()` (their node code + `import.meta.url`
   * dist lookups don't survive static Next bundling) and pass them here —
   * `initHub` resolves async/factory entries.
   */
  devframes?: InitHubOptions['devframes']
  /** Prebuilt dock-renderer modules forwarded to `initHub({ renderers })`. */
  renderers?: InitHubOptions['renderers']
  /** Extra RPC declarations registered at context creation. */
  rpcDeclarations?: InitHubOptions['rpcDeclarations']
  /** Runs once the context exists and every devframe is mounted. */
  configure?: (ctx: Parameters<NonNullable<InitHubOptions['configure']>>[0]) => void | Promise<void>
  /**
   * The hub's UI slot. Defaults to `@devframes/hub-ui`'s `createUi()` (loaded
   * through a bundler-ignored dynamic `import()` so its `import.meta.url` asset
   * lookups resolve at request time). Pass your own {@link DevframeHubUi} to
   * swap the hub UI provider, or `false` for a headless hub.
   */
  ui?: DevframeHubUi | false
  /** The hub's single auth gate. Gates by default; `false` opts out. */
  auth?: InitHubOptions['auth']
  /**
   * Expose the aggregate MCP endpoint at `<base>__mcp`. Default: `true`
   * (the Next hub's agent surface rides the same catch-all route).
   */
  mcp?: InitHubOptions['mcp']
  /** Public origin the Next app is reachable at. Default: derived from `PORT`. */
  origin?: InitHubOptions['origin']
  /** Publish this hub in the global instance registry. Default: off. */
  register?: InitHubOptions['register']
  /** Override where persisted devframe state lives. */
  getStorageDir?: InitHubOptions['getStorageDir']
  /** Name for the hub instance (logs, diagnostics, MCP server). */
  name?: string
  /** Version for the hub instance (logs, diagnostics, MCP server). */
  version?: string
}

/**
 * Build a devframes-hub for a Next.js App Router app: one `initHub()` call
 * mounting every devframe under `<base><id>/` behind one web-standard
 * `handler`, with the RPC socket on a side-car (Next routes can't accept WS
 * upgrades) and the aggregate MCP route on by default. The UI defaults to
 * `@devframes/hub-ui`'s `createUi()`, loaded lazily via a bundler-ignored
 * dynamic `import()` so its asset lookups resolve at request time; pass `ui`
 * to swap it or `ui: false` for a headless hub.
 *
 * Prefer {@link nextDevframeHub} at a route module — it memoizes this on
 * `globalThis` so Next's dev-time route re-evaluation reuses one instance
 * instead of leaking a side-car per reload.
 */
export async function createNextDevframeHub(options: NextDevframeHubOptions = {}): Promise<HubInstance> {
  const base = normalizeHubBase(options.base ?? DEVFRAMES_HUB_BASE)

  const ui = options.ui === false
    ? undefined
    : options.ui ?? await loadDefaultUi()

  return initHub({
    base,
    ...(options.cwd != null ? { cwd: options.cwd } : {}),
    ...(options.host != null ? { host: options.host } : {}),
    ...(options.origin != null ? { origin: options.origin } : {}),
    auth: options.auth,
    // Next route handlers can't accept WS upgrades — always a side-car socket.
    ws: options.port != null ? { port: options.port } : { sidecar: true },
    // The Next hub's agent surface rides the same catch-all route by default.
    mcp: options.mcp ?? true,
    ...(ui ? { ui } : {}),
    ...(options.renderers ? { renderers: options.renderers } : {}),
    ...(options.rpcDeclarations ? { rpcDeclarations: options.rpcDeclarations } : {}),
    ...(options.register != null ? { register: options.register } : {}),
    ...(options.getStorageDir ? { getStorageDir: options.getStorageDir } : {}),
    ...(options.name != null ? { name: options.name } : {}),
    ...(options.version != null ? { version: options.version } : {}),
    ...(options.devframes ? { devframes: options.devframes } : {}),
    ...(options.configure ? { configure: options.configure } : {}),
  })
}

/** A route-facing hub handle whose instance is memoized on `globalThis`. */
export interface NextDevframeHubHandle {
  /** The normalized mount base this hub answers under. */
  base: string
  /** Delegate an App Router catch-all route straight to this. */
  handler: (request: Request) => Promise<Response>
  /** Await the underlying {@link HubInstance} (building it on first access). */
  ready: () => Promise<HubInstance>
  /** Tear down the memoized instance (side-car, MCP sessions) and forget it. */
  close: () => Promise<void>
}

interface HubRegistry {
  __devframesNextHubs?: Map<string, Promise<HubInstance>>
}

function hubRegistry(): Map<string, Promise<HubInstance>> {
  const g = globalThis as HubRegistry
  return (g.__devframesNextHubs ??= new Map())
}

/**
 * Route-facing devframes-hub for a Next.js App Router app, memoized on
 * `globalThis` by mount base so Next's dev-time route re-evaluation reuses
 * one instance instead of leaking a side-car per reload. Build it once at the
 * catch-all route module and delegate the verbs to it:
 *
 * ```ts
 * // app/__devframes/[[...path]]/route.ts
 * export const runtime = 'nodejs'
 * export const dynamic = 'force-dynamic'
 *
 * import { nextDevframeHub } from '@devframes/next/hub'
 *
 * const hub = nextDevframeHub({ devframes: [] })
 * export const GET = (req: Request) => hub.handler(req)
 * export const POST = (req: Request) => hub.handler(req)
 * export const DELETE = (req: Request) => hub.handler(req)
 * ```
 */
export function nextDevframeHub(options: NextDevframeHubOptions = {}): NextDevframeHubHandle {
  const base = normalizeHubBase(options.base ?? DEVFRAMES_HUB_BASE)

  const ready = (): Promise<HubInstance> => {
    const registry = hubRegistry()
    let instance = registry.get(base)
    if (!instance) {
      instance = createNextDevframeHub({ ...options, base })
      registry.set(base, instance)
    }
    return instance
  }

  return {
    base,
    async handler(request) {
      return (await ready()).handler(request)
    },
    ready,
    async close() {
      const registry = hubRegistry()
      const instance = registry.get(base)
      if (!instance)
        return
      registry.delete(base)
      await (await instance).close()
    },
  }
}

/**
 * Load `@devframes/hub-ui`'s default UI through a bundler-ignored dynamic
 * `import()`: `createUi()` resolves its prebuilt assets via `import.meta.url`,
 * which only points at the published `dist` when Node loads the package at
 * request time — a static import would be rewritten into a Next server chunk.
 */
async function loadDefaultUi(): Promise<DevframeHubUi> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '@devframes/hub-ui')
  return (mod.createUi as () => DevframeHubUi)()
}
