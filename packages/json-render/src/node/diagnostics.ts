import { defineDiagnostics } from 'devframe/utils/nostics'

/**
 * `@devframes/json-render` protocol/runtime diagnostics share the `DF`
 * prefix and use the next globally available core codes. Browser-only render
 * failures keep `console.*` in the UI package.
 */
export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
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
      fix: 'Specs and state travel as strict JSON - remove functions, symbols, class instances, Map/Set, or circular references.',
    },
    DF0073: {
      why: (p: { id: string, issues: string }) =>
        `JSON-render view "${p.id}" does not match its configured schema: ${p.issues}`,
      fix: 'Match the authored spec to the Standard Schema passed to `createJsonRenderView`.',
    },
    DF0074: {
      why: (p: { id: string }) =>
        `JSON-render view "${p.id}" uses an asynchronous Standard Schema.`,
      fix: 'Use a synchronous Standard Schema so initial creation and updates remain synchronous.',
    },
  },
})
