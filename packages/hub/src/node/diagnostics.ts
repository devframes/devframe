import { defineDiagnostics } from 'nostics'
import { hubReporter } from '../utils/diagnostics-reporter'

// Hub-side diagnostics for docks, terminals, messages, and commands.
// Shares the `DF` prefix with devframe core; the hub reserves the
// `DF8xxx` range so the unified surface stays collision-free.
// Sub-ranges:
//   DF8000-DF8099 — hub context / lifecycle
//   DF8100-DF8199 — docks
//   DF8200-DF8299 — terminals
//   DF8300-DF8399 — messages
//   DF8400-DF8499 — commands
export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  reporters: [hubReporter],
  codes: {
    DF8100: {
      why: (p: { id: string }) => `Dock with id "${p.id}" is already registered`,
      fix: 'Use the `force` parameter to overwrite an existing registration.',
    },
    DF8101: {
      why: 'Cannot change the id of a dock. Use register() to add new docks.',
    },
    DF8102: {
      why: (p: { id: string }) => `Dock with id "${p.id}" is not registered. Use register() to add new docks.`,
    },
    DF8103: {
      why: (p: { id: string, name: string }) => `Devframe "${p.name}" (id "${p.id}") is already mounted on this hub`,
      fix: 'Each devframe is deduplicated by id. Set `duplicationStrategy: "duplicate"` on the definition to let instances coexist, `"silent"` to drop duplicates quietly, or `"throw"` to surface them as errors.',
    },
    DF8200: {
      why: (p: { id: string }) => `Terminal session with id "${p.id}" already registered`,
    },
    DF8201: {
      why: (p: { id: string }) => `Terminal session with id "${p.id}" not registered`,
    },
    DF8400: {
      why: (p: { id: string }) => `Command "${p.id}" is already registered`,
    },
    DF8401: {
      why: 'Cannot change the id of a command. Use register() to add new commands.',
    },
    DF8402: {
      why: (p: { id: string }) => `Command "${p.id}" is not registered`,
    },
    DF8403: {
      why: (p: { id: string }) => `Command id "${p.id}" is already used by another command or child command`,
      fix: 'Use globally unique command ids for top-level commands and all child commands.',
    },
  },
})
