/**
 * Re-exports `nostics`'s public API — `defineDiagnostics`, the `Diagnostic`
 * class, its supporting types, and the ANSI formatter — so integrations that
 * define their own coded `diagnostics.ts` (the built-in plugins,
 * `@devframes/hub`, `@devframes/json-render`, …) reach it through
 * `devframe/utils/nostics` instead of taking a direct dependency on
 * `nostics` themselves.
 */
export {
  createConsoleReporter,
  defineDiagnostics,
  defineProdDiagnostics,
  Diagnostic,
  formatDiagnostic,
} from 'nostics'

export type {
  AnyDiagnosticReporter,
  ConsoleMethod,
  ConsoleReporterOptions,
  DefineDiagnosticsOptions,
  DiagnosticCallParams,
  DiagnosticDefinition,
  DiagnosticHandle,
  DiagnosticInit,
  DiagnosticReporter,
  Diagnostics,
} from 'nostics'

export { ansiFormatter } from 'nostics/formatters/ansi'
