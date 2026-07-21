import type { Diagnostic } from 'nostics'
import { colors as c } from 'devframe/utils/colors'
import { defineDiagnostics } from 'nostics'
import { ansiFormatter } from 'nostics/formatters/ansi'

const formatAnsi = ansiFormatter(c)

interface ReporterOptions { method?: 'log' | 'warn' | 'error' }

function jsonRenderReporter(d: Diagnostic, { method = 'warn' }: ReporterOptions = {}): void {
  // eslint-disable-next-line no-console
  console[method](formatAnsi(d))
}

// `@devframes/json-render` protocol/runtime diagnostics. These share the
// `DF` prefix and live in the devframe core range (next free after the
// current highest `DF00xx`, DF0037). Browser-only render failures keep
// `console.*` in the UI package.
export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  reporters: [jsonRenderReporter],
  codes: {
    DF0038: {
      why: (p: { id: string, key: string, issues: string }) =>
        `JSON-render view "${p.id}" received invalid props on element "${p.key}": ${p.issues}`,
      fix: 'Match the element props to the base catalog\'s prop schema for that component. See the component reference for the expected shape.',
    },
    DF0039: {
      why: (p: { id: string, scope: string }) =>
        `A JSON-render view with id "${p.id}" already exists in scope "${p.scope}".`,
      fix: 'Give each view a stable id unique within its scope, or dispose the previous view before recreating it.',
    },
    DF0040: {
      why: (p: { id: string }) =>
        `JSON-render view "${p.id}" was used after it was disposed.`,
      fix: 'Create a fresh view with `createJsonRenderView` instead of reusing a disposed handle.',
    },
    DF0041: {
      why: (p: { id: string, reason: string }) =>
        `JSON-render view "${p.id}" spec is not JSON-serializable: ${p.reason}`,
      fix: 'Specs and state travel as strict JSON — remove functions, symbols, class instances, Map/Set, or circular references.',
    },
  },
})
