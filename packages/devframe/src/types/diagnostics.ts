import type { defineDiagnostics } from 'devframe/utils/nostics'

/**
 * The shared diagnostics lookup exposed by the host. A `Proxy` that resolves
 * any registered code name to its `nostics` handle (a callable that builds
 * a diagnostic and routes it through registered reporters). Typed loosely
 * because it spans heterogeneous definitions registered by different
 * integrations.
 */
export type DevframeDiagnosticsLogger = Record<string, any>

/**
 * Options accepted by the host's `defineDiagnostics()` factory. Re-exported
 * from `devframe/utils/nostics` - the same shape every module-level
 * `diagnostics.ts` (devframe core, `@devframes/hub`, the built-in plugins)
 * accepts, since `host.defineDiagnostics()` and the top-level
 * `defineDiagnostics` from `devframe/utils/nostics` pre-wire the identical
 * ANSI console reporter.
 */
export type { DevframeDefineDiagnosticsOptions } from 'devframe/utils/nostics'

/**
 * Host for structured diagnostics - a thin layer over `nostics` that lets
 * integrations register their own coded errors/warnings into a shared
 * registry without taking a direct dependency on `nostics`.
 *
 * Typical usage from a plugin's `setup(ctx)`:
 *
 * ```ts
 * const myDiagnostics = ctx.diagnostics.defineDiagnostics({
 *   docsBase: 'https://example.com/errors',
 *   codes: {
 *     MYP0001: { why: 'Something went wrong' },
 *   },
 * })
 * ctx.diagnostics.register(myDiagnostics)
 *
 * // Through the shared lookup (loose typing):
 * throw ctx.diagnostics.logger.MYP0001()
 *
 * // Or directly on the typed handle returned from `defineDiagnostics`:
 * throw myDiagnostics.MYP0001()
 * ```
 */
export interface DevframeDiagnosticsHost {
  /**
   * Proxy-backed lookup of every registered diagnostic handle by code name.
   * Resolves to a `nostics` `DiagnosticHandle` - a callable that builds a
   * diagnostic and routes it through registered reporters; prefix with
   * `throw` to raise. Loosely typed - for autocompletion, keep a reference
   * to the typed result of `defineDiagnostics()` instead.
   */
  readonly logger: DevframeDiagnosticsLogger

  /**
   * Register additional diagnostic definitions with this host. After
   * registration, codes from the new definition are reachable via
   * `host.logger.CODE`. Plugins that want shared output formatting should
   * build their diagnostics via `host.defineDiagnostics()` first - that
   * factory pre-wires the host's ANSI console reporter.
   */
  register: (definitions: Record<string, unknown>) => void

  /**
   * Build a typed diagnostics object with the host's ANSI console reporter
   * pre-wired. The same `devframe/utils/nostics` `defineDiagnostics` every
   * built-in plugin's module-level `diagnostics.ts` uses, so integrations
   * don't need to take a direct dependency on `nostics`.
   */
  defineDiagnostics: typeof defineDiagnostics
}
