/**
 * Cross-plugin services — a typed, namespaced registry on the shared node
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
 * // consumer (another plugin) — no runtime dependency on the provider
 * ctx.services.whenAvailable('devframes:plugin:data-inspector:sources', (sources) => {
 *   sources.register({ id: 'my-plugin:state', title: 'My state', data: () => state })
 * })
 * ```
 *
 * Service ids follow the same namespacing rule as RPC functions: prefix with
 * the providing plugin's id.
 */

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
   * Run `callback` with the service as soon as it is available — immediately
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
}
