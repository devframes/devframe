/**
 * Cross-plugin services: a typed, namespaced registry on the shared node
 * context through which one integration exposes a capability and others
 * consume it without a hard package dependency.
 *
 * A provider ships a *types-only* augmentation of {@link DevframeServicesRegistry}
 * (so consumers get full typing from `import type`), then provides the
 * implementation at setup time:
 *
 * ```ts
 * // provider (e.g. the data-inspector plugin)
 * declare module 'devframe' {
 *   interface DevframeServicesRegistry {
 *     'devframes:plugin:data-inspector:sources': DataSourcesService
 *   }
 * }
 * ctx.services.provide('devframes:plugin:data-inspector:sources', host)
 *
 * // consumer (another plugin), no runtime dependency on the provider
 * ctx.services.whenAvailable('devframes:plugin:data-inspector:sources', (sources) => {
 *   sources.register({ id: 'my-plugin:state', title: 'My state', data: () => state })
 * })
 * ```
 *
 * Service ids follow the same namespacing rule as RPC functions: prefix with
 * the providing plugin's id.
 *
 * On top of this in-process tier sit **wire services**
 * ({@link DevframeServiceDefinition}): npm-packaged capabilities installed
 * via {@link DevframeServicesHost.install} (or declaratively through
 * `DevframeDefinition.services`), keyed by their npm package name, that also
 * register RPC functions and are advertised to browser clients through the
 * `devframe:services` shared state for feature-detection.
 */

import type { DevframeScopedNodeContext } from './scope'

/**
 * Augmentation point mapping service ids to their implementation types.
 * Providers extend this via `declare module 'devframe'`.
 */
export interface DevframeServicesRegistry {}

/**
 * A known (augmented) service id, or any namespaced string for services
 * without a published type augmentation.
 */
export type DevframeServiceId = keyof DevframeServicesRegistry | (string & {})

/** Resolved service type for an id: augmented type, or `unknown`. */
export type DevframeServiceOf<ID> = ID extends keyof DevframeServicesRegistry
  ? DevframeServicesRegistry[ID]
  : unknown

/**
 * Augmentation point mapping a service's npm package name to the RPC scope
 * namespace it registers its functions under, so a client's
 * `services.get('@devframes/service-x')` returns a scoped RPC surface typed
 * against that namespace. Service packages contribute their entry via
 * declaration merging:
 *
 * ```ts
 * declare module 'devframe' {
 *   interface DevframeServicesScopeRegistry {
 *     '@devframes/service-open': 'devframes:service:open'
 *   }
 * }
 * ```
 */
export interface DevframeServicesScopeRegistry {}

/** Resolved RPC scope namespace for a service package name, or `string`. */
export type DevframeServiceScopeOf<PKG> = PKG extends keyof DevframeServicesScopeRegistry
  ? DevframeServicesScopeRegistry[PKG] & string
  : string

/**
 * A **wire service**: a shared server-side capability (e.g. open-in-editor,
 * syntax highlighting) packaged so any devframe host can install it once and
 * every plugin/client can consume it without re-implementing or re-bundling
 * it. Contrast with plain {@link DevframeServicesHost.provide}, which shares
 * an in-process object between plugins on the node side only: a
 * `DevframeServiceDefinition` additionally registers RPC functions under its
 * {@link DevframeServiceDefinition.scope} and is **advertised to clients**
 * through the reactive `devframe:services` shared state, so browser UIs can
 * feature-detect it (`ctx.services.has(pkg)`) and degrade gracefully.
 *
 * Ship one per npm package (`@devframes/service-<slug>` for first-party),
 * with the package's default export being the `create<X>Service` factory,
 * never a pre-built instance.
 */
export interface DevframeServiceDefinition<API = unknown, Options = any> {
  /**
   * The npm package name this service ships in, also its registry key
   * (`ctx.services.has('@devframes/service-x')` on both node and client).
   */
  package: string
  /** Semver of the service, advertised to clients and checked against descriptor ranges. */
  version: string
  /**
   * RPC namespace the service's functions register under, following the
   * plugin id grammar (e.g. `devframes:service:open`). `setup` receives a
   * context pre-scoped to it, so functions register with bare names.
   */
  scope: string
  /**
   * Extra advertised metadata (feature flags, defaults, …). Must be
   * JSON-serializable, since it is mirrored to every client.
   */
  meta?: Record<string, unknown>
  /**
   * This instance's own option set (usually baked in by the factory that
   * created the definition). Joins the merge alongside every declarative
   * descriptor's `options`.
   */
  options?: Options
  /**
   * Merge the option sets contributed by multiple installers (in declaration
   * order) into the one bag passed to `setup`. Defaults to a shallow merge
   * where later sets win.
   */
  mergeOptions?: (sets: Options[]) => Options
  /**
   * Construct the service: register its RPC functions on the pre-scoped
   * context and return its **node API**: the in-process surface other
   * plugins get from `ctx.services.get(package)` (no RPC hop server-side).
   * `info.options` carries every installer's option sets merged at the
   * `ready()` barrier (via {@link mergeOptions} when present, otherwise a
   * shallow merge in declaration order, later sets win).
   */
  setup: (ctx: DevframeScopedNodeContext, info: { options?: Options }) => API | Promise<API>
}

/**
 * Declarative reference to a service package: the form a
 * {@link DevframeServiceInput} takes when the installer doesn't hold the
 * factory itself (e.g. `DevframeDefinition.services`). The host imports the
 * package's default-export factory and installs the resulting definition at
 * the `ready()` barrier.
 */
export interface DevframeServiceDescriptor<Options = any> {
  /** npm package name of the service (its default export is the factory). */
  package: string
  /**
   * Accepted semver range for the installed service. An unsatisfied range
   * warns (`DF0069`), or throws (`DF0068`) when {@link required}, while the
   * service still installs; the advertised meta carries the real version.
   */
  version?: string
  /**
   * Fail hard when the service can't be imported or its version range isn't
   * satisfied. By default a missing service is skipped silently; clients see
   * `has() === false` and degrade.
   *
   * @default false
   */
  required?: boolean
  /** Option set this installer contributes to the merge. */
  options?: Options
}

/**
 * What can be passed to `ctx.services.install()` (and listed in
 * `DevframeDefinition.services`): a declarative {@link DevframeServiceDescriptor}
 * (the host imports the factory) or a ready {@link DevframeServiceDefinition}
 * (the installer already called the factory, so its `options` join the merge).
 */
export type DevframeServiceInput<API = unknown, Options = any>
  = DevframeServiceDescriptor<Options> | DevframeServiceDefinition<API, Options>

/**
 * One service's advertisement entry, mirrored to clients through the
 * `devframe:services` shared state.
 */
export interface DevframeServiceMeta {
  /** npm package name, the registry key. */
  package: string
  /** Installed version of the service. */
  version: string
  /** RPC namespace its functions live under. */
  scope: string
  /** Extra service-declared metadata. */
  meta?: Record<string, unknown>
}

/**
 * Shape of the `devframe:services` shared state: package name → advertisement.
 */
export type DevframeServicesState = Record<string, DevframeServiceMeta>

export interface DevframeServicesHost {
  /**
   * Publish a service under a namespaced id. Throws `DF0037` when the id is
   * already provided (revoke first to replace). Returns a revoke function.
   */
  provide: <ID extends DevframeServiceId>(id: ID, service: DevframeServiceOf<ID>) => () => void
  /** The service currently provided under `id`, or `undefined`. */
  get: <ID extends DevframeServiceId>(id: ID) => DevframeServiceOf<ID> | undefined
  has: (id: DevframeServiceId) => boolean
  /**
   * Run `callback` with the service as soon as it is available: immediately
   * when already provided, otherwise on `provide`. Survives provider/consumer
   * setup-order differences. The callback also re-fires if the service is
   * revoked and provided again. Returns an unsubscribe function.
   */
  whenAvailable: <ID extends DevframeServiceId>(
    id: ID,
    callback: (service: DevframeServiceOf<ID>) => void,
  ) => () => void
  /** Ids of every currently-provided service. */
  keys: () => string[]
  /**
   * Install a **wire service** (see {@link DevframeServiceDefinition}). The
   * common path is declarative: list services on `DevframeDefinition.services`
   * (or `initHub({ services })`) and the adapter installs them for you before
   * `setup` runs. Call `install()` directly only for the dynamic escape hatch:
   * a service configured at runtime from data unknown until then.
   *
   * Before the pre-setup ready fires, installs are queued and their option
   * sets deep-merged, constructing each service **once**. After it, an install
   * constructs immediately; installing an already-installed package returns
   * the existing API (a warning, `DF0066`, when the late install carried
   * options, since they're ignored). The returned promise resolves with the
   * node API (or `undefined` when an optional descriptor's package can't be
   * imported).
   *
   * `resolveFrom` is where a descriptor's package resolves **from**: a path
   * or file URL (e.g. the declaring devframe's `importMetaUrl`), or an npm
   * package name, so its declared services resolve against the declarer's own
   * dependencies. Falls back to the context's `workspaceRoot` then `cwd`.
   */
  install: <API = unknown, Options = any>(
    input: DevframeServiceInput<API, Options>,
    options?: { resolveFrom?: string | null },
  ) => Promise<API | undefined>
  /**
   * Construct every queued service, importing descriptor packages, merging
   * option sets, `provide()`-ing each node API under its package name, and
   * advertising it to clients via the `devframe:services` shared state.
   * Idempotent. **Internal**: the adapters call it once, before running any
   * `setup`, so services are ready for `setup` to consume; application code
   * uses declarative `services` (or `install()` for the dynamic case) and
   * never calls this. Rejects when a `required` service fails to import or
   * misses its version range.
   */
  ready: () => Promise<void>
}
