import type { defineDiagnostics, Diagnostic, DiagnosticDefinition } from 'nostics'

/**
 * A diagnostics definition object built with `defineDiagnostics`. Typed as
 * `unknown` because each integration's definition has a distinct narrow shape
 * (e.g. specific code keys like `DF0001` / `MYP0001`), and TypeScript's mapped
 * types don't allow assigning a narrow-keyed result to a generically-keyed
 * one. The host stores them in a heterogeneous registry.
 */
export type DevToolsDiagnosticsDefinition = ReturnType<typeof defineDiagnostics<any, any>>

/**
 * The shared diagnostics lookup exposed by the host. A `Proxy` that resolves
 * any registered code name to its `nostics` handle (with `.report()` and
 * `.throw()` methods). Typed loosely because it spans heterogeneous
 * definitions registered by different integrations.
 */
export type DevToolsDiagnosticsLogger = Record<string, any>

/**
 * Options accepted by the host's `defineDiagnostics()` factory — mirrors
 * `nostics`'s shape but the host pre-wires its ANSI console reporter, so
 * plugins typically omit `reporters`.
 */
export interface DevToolsDefineDiagnosticsOptions<Codes extends Record<string, DiagnosticDefinition>> {
  docsBase?: string | ((code: keyof Codes) => string | undefined)
  codes: Codes
  reporters?: ReadonlyArray<(d: Diagnostic, o?: any) => void>
}

/**
 * Host for structured diagnostics — a thin layer over `nostics` that lets
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
 * ctx.diagnostics.logger.MYP0001.throw()
 *
 * // Or directly on the typed handle returned from `defineDiagnostics`:
 * myDiagnostics.MYP0001.throw()
 * ```
 */
export interface DevToolsDiagnosticsHost {
  /**
   * Proxy-backed lookup of every registered diagnostic handle by code name.
   * Resolves to a `nostics` `DiagnosticHandle` with `.report()` / `.throw()`.
   * Loosely typed — for autocompletion, keep a reference to the typed
   * result of `defineDiagnostics()` instead.
   */
  readonly logger: DevToolsDiagnosticsLogger

  /**
   * Register additional diagnostic definitions with this host. After
   * registration, codes from the new definition are reachable via
   * `host.logger.CODE`. Plugins that want shared output formatting should
   * build their diagnostics via `host.defineDiagnostics()` first — that
   * factory pre-wires the host's ANSI console reporter.
   */
  register: (definitions: Record<string, unknown>) => void

  /**
   * Build a typed diagnostics object with the host's ANSI console reporter
   * pre-wired. Mirrors `nostics`'s `defineDiagnostics` so integrations don't
   * need to take a direct dependency on `nostics`.
   */
  defineDiagnostics: <const Codes extends Record<string, DiagnosticDefinition>>(
    options: DevToolsDefineDiagnosticsOptions<Codes>,
  ) => ReturnType<typeof defineDiagnostics<Codes, any>>
}
