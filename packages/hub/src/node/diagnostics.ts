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
      why: (p: { id: string, attempted: string }) => `Cannot change the id of dock "${p.id}" to "${p.attempted}". Dock ids are immutable once registered`,
      fix: (p: { id: string, attempted: string }) => `Remove \`id\` from the patch to keep updating "${p.id}", or call register() with the full entry to add "${p.attempted}" as a new dock.`,
    },
    DF8102: {
      why: (p: { id: string }) => `Dock with id "${p.id}" is not registered and cannot be updated`,
      fix: (p: { id: string }) => `Call register() to add "${p.id}" as a new dock, or check the id for typos.`,
    },
    DF8103: {
      why: (p: { id: string }) => `Dock entry "${p.id}" cannot set groupId to its own id`,
      fix: 'Point groupId at a different group entry, or omit it.',
    },
    DF8104: {
      why: (p: { id: string }) => `Dock group "${p.id}" cannot itself belong to a group (nested groups are unsupported)`,
      fix: 'Remove groupId from the group entry; nest members one level only.',
    },
    DF8105: {
      why: (p: { id: string, name: string }) => `Devframe "${p.name}" (id "${p.id}") is already mounted on this hub`,
      fix: 'Each devframe is deduplicated by id. Set `duplicationStrategy: "duplicate"` on the definition to let instances coexist, `"silent"` to drop duplicates quietly, or `"throw"` to surface them as errors.',
    },
    DF8106: {
      why: (p: { id: string, name: string, base: string }) => `The host cannot serve the RPC connection meta for devframe "${p.name}" (id "${p.id}") at "${p.base}" — its \`DevframeHost\` does not implement \`mountConnectionMeta\`.`,
      fix: 'Implement `mountConnectionMeta(base)` on your DevframeHost so it serves `__connection.json` at each mounted base. Without it, the devframe SPA connects only when it shares an origin with the hub UI (same-origin window inheritance); cross-origin, sandboxed, or directly-opened iframes stay disconnected. Static-snapshot hosts that bake the meta into the served files can implement it as a no-op to acknowledge this intentionally.',
    },
    DF8107: {
      why: (p: { id: string }) => `Dock activation requested for unknown dock id "${p.id}"`,
      fix: 'Pass a `dockId` that matches a registered dock entry. The activation is still broadcast, but no viewer will switch to it. Ids are case-sensitive — check for typos, and ensure the target dock is registered before activating it.',
    },
    DF8200: {
      why: (p: { id: string }) => `Terminal session with id "${p.id}" already registered`,
    },
    DF8201: {
      why: (p: { id: string }) => `Terminal session with id "${p.id}" not registered`,
    },
    DF8202: {
      why: (p: { id: string }) => `Terminal session "${p.id}" does not accept input`,
      fix: 'Spawn it via ctx.terminals.startPtySession() to get an interactive, writable session.',
    },
    DF8203: {
      why: (p: { command: string, reason: string }) => `Failed to spawn PTY session for "${p.command}": ${p.reason}`,
    },
    DF8204: {
      why: (p: { id: string }) => `Terminal session "${p.id}" cannot be controlled (no lifecycle handle)`,
      fix: 'Spawn it via ctx.terminals.startChildProcess() or startPtySession() — sessions added with a bare register() expose no terminate/restart handle.',
    },
    DF8205: {
      why: (p: { id: string }) => `Terminal session "${p.id}" is not restartable`,
      fix: 'It was registered with `restartable: false`; restart it through its owner\'s controls, or spawn it with `restartable: true` (the default) to allow in-place restarts.',
    },
    DF8400: {
      why: (p: { id: string }) => `Command "${p.id}" is already registered`,
    },
    DF8401: {
      why: 'Cannot change the id of a command. Use register() to add new commands',
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
