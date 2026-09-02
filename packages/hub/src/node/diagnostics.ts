import { defineDiagnostics } from 'devframe/utils/nostics'

/**
 * Hub-side diagnostics for docks, terminals, messages, and commands.
 * Shares the `DF` prefix with devframe core; the hub reserves the
 * `DF8xxx` range so the unified surface stays collision-free.
 * Sub-ranges:
 * DF8000-DF8099: hub context / lifecycle
 * DF8100-DF8199: docks
 * DF8200-DF8299: terminals
 * DF8300-DF8399: messages
 * DF8400-DF8499: commands
 */
export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  codes: {
    DF8000: {
      why: (p: { id: string }) => `Devframe id "${p.id}" collides with a reserved hub path, so it cannot be mounted directly under the hub base.`,
      fix: 'The filenames directly under the hub base (`__connection.json`, `__ws`, `__index.json`, `__client-imports.js`, `__mcp`, `embedded.js`) are reserved for the hub protocol. Rename the devframe id, or override its mount with a non-colliding `basePath`.',
    },
    DF8002: {
      why: 'initHub received both `devframes` and `context`; the two assembly modes are mutually exclusive.',
      fix: 'Pass `devframes` to let the instance create the hub context and mount each frame itself, or pass a pre-built `context` (your host already mounted the frames), but never both.',
    },
    DF8003: {
      why: 'connectionMeta() was called before initHub finished initializing.',
      fix: 'Await `instance.ready` (or any request through `instance.handler`) before reading `connectionMeta()`, since the WebSocket binding it describes is only known once initialization completes.',
    },
    DF8004: {
      why: (p: { id: string }) => `Devframe id "${p.id}" is not a mountable URL segment, and the hub mounts each frame at \`<base><id>/\`.`,
      fix: 'Ids become route segments, so they may only contain letters, digits, `_`, `-`, and `.`; `:` and `*` are route-pattern markers to the underlying router, and `/` would escape the segment. Set a route-safe `id` on the definition (e.g. `my_plugin` instead of `my:plugin`).',
    },
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
      why: (p: { id: string, name: string, base: string }) => `The host cannot serve the RPC connection meta for devframe "${p.name}" (id "${p.id}") at "${p.base}"; its \`DevframeHost\` does not implement \`mountConnectionMeta\`.`,
      fix: 'Implement `mountConnectionMeta(base)` on your DevframeHost so it serves `__connection.json` at each mounted base. Without it, the devframe SPA connects only when it shares an origin with the hub UI (same-origin window inheritance); cross-origin, sandboxed, or directly-opened iframes stay disconnected. Static-snapshot hosts that bake the meta into the served files can implement it as a no-op to acknowledge this intentionally.',
    },
    DF8107: {
      why: (p: { id: string }) => `Dock activation requested for unknown dock id "${p.id}"`,
      fix: 'Pass a `dockId` that matches a registered dock entry. The activation is still broadcast, but no hub UI provider will switch to it. Ids are case-sensitive, so check for typos, and ensure the target dock is registered before activating it.',
    },
    DF8108: {
      why: (p: { type: string }) => `A renderer module is already registered for dock type "${p.type}"`,
      fix: 'Each dock type resolves to exactly one renderer module in the hub\'s renderer manifest. Remove the duplicate `renderers` registration, or give the second renderer its own dock type.',
    },
    DF8109: {
      why: (p: { type: string, file: string }) => `The renderer module registered for dock type "${p.type}" does not exist at "${p.file}"`,
      fix: 'Point the registration\'s `file` at the prebuilt browser ES module (build the renderer package first, or check the path). Registration helpers like `jsonRenderUiRenderer()` resolve the path for you.',
    },
    DF8110: {
      why: (p: { type: string }) => `Dock type "${p.type}" is not a servable renderer-module name; the hub serves each module at \`<base>__renderers/<type>.mjs\``,
      fix: 'Renderer types become URL segments, so they may only contain letters, digits, `_`, `-`, and `.`. Use a route-safe dock type (e.g. `json-render`).',
    },
    DF8111: {
      why: (p: { id: string, specifier: string }) => `Dock "${p.id}" declares the bare-specifier client script "${p.specifier}", but this host advertises no client-module resolution, and the browser cannot resolve a bare npm specifier natively, so the script will fail to load.`,
      fix: 'Run under a host framework that declares `initHub({ clientModuleResolution })` (e.g. Vite\'s `\'/@id/{specifier}\'`), ship the script as a self-contained bundle served by URL, or resolve it in the hub UI provider via `createDevframeClientRuntime({ resolveClientModule })` (then disregard this warning).',
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
      fix: 'Spawn it via ctx.terminals.startChildProcess() or startPtySession(); sessions added with a bare register() expose no terminate/restart handle.',
    },
    DF8205: {
      why: (p: { id: string }) => `Terminal session "${p.id}" is not restartable`,
      fix: 'It was registered with `restartable: false`; restart it through its owner\'s controls, or spawn it with `restartable: true` (the default) to allow in-place restarts.',
    },
    DF8206: {
      why: (p: { id: string }) => `Terminal session "${p.id}" cannot be restarted because its output stream is already closed`,
      fix: 'The session already exited (or was terminated) and its stream is spent. Drop it with `ctx.terminals.remove(session)`, then spawn a replacement via `ctx.terminals.startChildProcess()` or `ctx.terminals.startPtySession()` with a fresh id.',
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
    DF8404: {
      why: (p: { id: string }) => `Command "${p.id}" declares agent exposure but has no handler`,
      fix: 'Agent-exposed commands must be executable server-side. Add a `handler` to the command, or move the `agent` field to an executable child command.',
    },
  },
})
