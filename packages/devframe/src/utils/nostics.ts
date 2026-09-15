import type { AnyDiagnosticReporter, Diagnostic, DiagnosticDefinition, Diagnostics } from 'nostics'
import { colors } from 'devframe/utils/colors'
import { defineDiagnostics as defineNosticsDiagnostics } from 'nostics'
import { ansiFormatter } from 'nostics/formatters/ansi'

const formatAnsi = ansiFormatter(colors)

/**
 * The reporter every {@link defineDiagnostics} call below wires in ahead of
 * any caller-supplied ones: prints the diagnostic through devframe's own
 * ANSI colors via `console[method]` (default `'warn'`).
 */
function devframeReporter(d: Diagnostic, { method = 'warn' }: { method?: 'log' | 'warn' | 'error' } = {}): void {
  // eslint-disable-next-line no-console
  console[method](formatAnsi(d))
}

/**
 * Options accepted by {@link defineDiagnostics}, identical to `nostics`'s
 * own `DefineDiagnosticsOptions`, minus the reporter devframe already
 * prepends.
 */
export type DevframeDefineDiagnosticsOptions<
  Codes extends Record<string, DiagnosticDefinition>,
  Reporters extends readonly AnyDiagnosticReporter[] = [],
> = Parameters<typeof defineDiagnostics<Codes, Reporters>>[0]

/**
 * Drop-in replacement for `nostics`'s `defineDiagnostics()` with devframe's
 * ANSI console reporter pre-wired ahead of any `reporters` passed in. Every
 * `diagnostics.ts` in devframe core, `@devframes/hub`, `@devframes/json-render`,
 * and the built-in plugins defines its codes through this instead of
 * `nostics`'s own `defineDiagnostics`; the reporter registration lives
 * here, once, so none of them need to build their own reporter (`colors`,
 * `ansiFormatter`) or take a direct dependency on `nostics` themselves.
 */
export function defineDiagnostics<
  const Codes extends Record<string, DiagnosticDefinition>,
  const Reporters extends readonly AnyDiagnosticReporter[] = [],
>(options: {
  docsBase?: string | ((code: keyof Codes) => string | undefined)
  codes: Codes
  reporters?: Reporters
}): DevframeDiagnostics<Codes, Reporters> {
  return defineNosticsDiagnostics({
    ...options,
    reporters: [devframeReporter, ...(options.reporters ?? [])],
  }) as DevframeDiagnostics<Codes, Reporters>
}

/**
 * The `Diagnostics` object returned by devframe's {@link defineDiagnostics}
 * (devframe's ANSI console reporter is always prepended). Integrations that
 * export their own `defineDiagnostics(...)` result as public API annotate it
 * with this type, so the reference resolves through `devframe/utils/nostics`
 * rather than inlining `nostics`'s types or taking a direct `nostics`
 * dependency.
 */
export type DevframeDiagnostics<
  Codes extends Record<string, DiagnosticDefinition>,
  Reporters extends readonly AnyDiagnosticReporter[] = [],
> = Diagnostics<Codes, readonly [typeof devframeReporter, ...Reporters]>

export {
  createConsoleReporter,
  defineProdDiagnostics,
  Diagnostic,
  formatDiagnostic,
} from 'nostics'

export type {
  AnyDiagnosticReporter,
  ConsoleMethod,
  ConsoleReporterOptions,
  DiagnosticCallParams,
  DiagnosticDefinition,
  DiagnosticHandle,
  DiagnosticInit,
  DiagnosticReporter,
  Diagnostics,
} from 'nostics'

export { ansiFormatter } from 'nostics/formatters/ansi'
