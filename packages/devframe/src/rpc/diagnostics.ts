import { defineDiagnostics } from 'nostics'
import { devframeReporter } from '../utils/diagnostics-reporter'

export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  reporters: [devframeReporter],
  codes: {
    DF0019: {
      why: (p: { name: string }) =>
        `RPC function "${p.name}" has \`agent\` set but \`jsonSerializable\` is not \`true\` — MCP requires JSON-serializable data.`,
      fix: 'Set `jsonSerializable: true` if the payload is JSON-safe, or remove `agent` to keep it RPC-only.',
    },
    DF0020: {
      why: (p: { name: string, type: string, path: string }) =>
        `RPC function "${p.name}" declares \`jsonSerializable: true\` but the value at "${p.path}" is a ${p.type}.`,
      fix: 'Either drop `jsonSerializable: true` (falls back to structured-clone) or change the value to a JSON-safe shape.',
    },
    DF0021: {
      why: (p: { name: string }) => `RPC function "${p.name}" is already registered`,
      fix: 'Use the `force` parameter to overwrite an existing registration.',
    },
    DF0022: {
      why: (p: { name: string }) => `RPC function "${p.name}" is not registered. Use register() to add new functions.`,
    },
    DF0023: {
      why: (p: { name: string }) => `RPC function "${p.name}" is not registered`,
    },
    DF0024: {
      why: (p: { name: string }) => `Either handler or setup function must be provided for RPC function "${p.name}"`,
    },
    DF0025: {
      why: (p: { name: string }) => `Function "${p.name}" not found in dump store`,
    },
    DF0026: {
      why: (p: { name: string, args: string }) => `No dump match for "${p.name}" with args: ${p.args}`,
    },
    DF0027: {
      why: (p: { name: string, type: string }) => `Function "${p.name}" with type "${p.type}" cannot have dump configuration. Only "static" and "query" types support dumps.`,
    },
    DF0028: {
      why: (p: { name: string, type: string }) => `Function "${p.name}" with type "${p.type}" cannot use \`snapshot: true\`. Only "query" functions support this sugar; "static" functions have equivalent default behavior already.`,
      fix: 'Remove `snapshot: true`, or change the function type to `query`.',
    },
  },
})
