import { defineDiagnostics } from 'nostics'
import { devframeReporter } from '../utils/diagnostics-reporter'

// DF00xx codes are allocated across packages (e.g. @devframes/json-render
// owns DF0037–DF0041), so this file alone doesn't show the next free
// number — check `docs/errors/` for the full allocation before adding one.
export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  reporters: [devframeReporter],
  codes: {
    DF0006: {
      why: (p: { name: string }) => `RPC function "${p.name}" is not registered`,
    },
    DF0007: {
      why: 'AsyncLocalStorage is not set, it likely to be an internal bug of the Devframe foundation',
    },
    DF0008: {
      why: (p: { distDir: string }) => `distDir ${p.distDir} does not exist`,
    },
    DF0012: {
      why: (p: { filepath: string }) => `Failed to parse storage file: ${p.filepath}, falling back to defaults.`,
    },
    DF0013: {
      why: (p: { key: string }) => `Shared state of "${p.key}" is not found, please provide an initial value for the first time`,
    },
    DF0014: {
      why: (p: { name: string }) => `RPC function "${p.name}" has an invalid \`agent\` field — \`description\` must be a non-empty string.`,
      fix: 'Provide a short description (~1–3 sentences) explaining what the tool does and when agents should invoke it.',
    },
    DF0015: {
      why: (p: { id: string }) => `Agent tool "${p.id}" is already registered.`,
      fix: 'Tool ids must be unique across RPC functions with an `agent` field and tools registered via `ctx.agent.registerTool()`.',
    },
    DF0016: {
      why: (p: { id: string }) => `Agent resource "${p.id}" is already registered.`,
    },
    DF0017: {
      why: (p: { transport: string, reason: string }) => `Failed to start MCP server (${p.transport}): ${p.reason}`,
    },
    DF0029: {
      why: (p: { channel: string, id: string, dropped: number }) =>
        `Stream "${p.channel}#${p.id}" dropped ${p.dropped} chunk(s) after exceeding the client high-water mark.`,
      fix: 'The consumer is too slow for the producer. Raise `highWaterMark` on the subscription, slow the producer, or batch chunks.',
    },
    DF0030: {
      why: (p: { channel: string, id: string }) =>
        `Stream "${p.channel}#${p.id}" is unknown — no producer has called \`channel.start({ id: "${p.id}" })\`.`,
      fix: 'Ensure the server-side producer is running before clients subscribe, or check for typos in the stream id.',
    },
    DF0031: {
      why: (p: { channel: string, id: string }) =>
        `Cannot write to closed stream "${p.channel}#${p.id}".`,
      fix: 'Track the producer lifecycle — guard writes with the `stream.signal.aborted` flag.',
    },
    DF0032: {
      why: (p: { channel: string }) =>
        `Streaming channel "${p.channel}" is already registered.`,
      fix: 'Each channel name must be unique within a context. Pick a different name or reuse the existing channel handle.',
    },
    DF0033: {
      why: (p: { id: string, reason: string }) =>
        `Failed to start dev RPC bridge for "${p.id}": ${p.reason}`,
      fix: 'Verify the bridge port is free and the devframe setup function does not throw. Pin a port via `cli.port` / `cli.portRange` on the definition, or via `devMiddleware.port` on `viteDevBridge`.',
    },
    DF0034: {
      why: (p: { namespace: string, name: string }) =>
        `Scoped RPC registration for namespace "${p.namespace}" received an already-namespaced function name "${p.name}".`,
      fix: 'A scoped context auto-namespaces ids. Pass a bare name without a ":" separator (e.g. `register({ name: "get-cwd" })`), or use the unscoped `ctx.base.rpc.register` for a fully-qualified name.',
    },
    DF0035: {
      why: (p: { filepath: string }) => `Failed to persist storage file: ${p.filepath}`,
      fix: 'Check that the storage directory is writable and has free space.',
    },
    DF0036: {
      why: (p: { name: string }) => `RPC call to "${p.name}" was rejected: the caller is not authorized.`,
      fix: 'Complete the auth handshake (or connect with a static/pre-shared token) before calling a trusted method. Untrusted callers may only call `anonymous:`-prefixed methods — see `isAnonymousRpcMethod`.',
    },
    DF0037: {
      why: (p: { id: string }) => `A service is already provided under "${p.id}".`,
      fix: 'Service ids are unique per context. Revoke the existing provider first (the `provide()` call returns a revoke function), or namespace the id with your plugin id to avoid collisions.',
    },
    DF0042: {
      why: (p: { id: string }) => `"${p.id}" declares \`capabilities.build: false\` — its static export is not meaningful (writes are excluded and any live-served data won't be there).`,
      fix: 'Pass `{ force: true }` to `createBuild()` if the degraded export is still useful to you, or drop `capabilities.build: false` on the definition.',
    },
    DF0045: {
      why: (p: { file: string, reason: string }) => `Failed to update the devframe instance registry at "${p.file}": ${p.reason}`,
      fix: 'Discovery tooling (`devframe connect`) will not see this instance. Check that the registry directory is writable, point `DEVFRAME_INSTANCES_DIR` at a writable directory, or set `DEVFRAME_DISABLE_INSTANCE_REGISTRY=1` to opt out of registration.',
    },
    DF0046: {
      why: (p: { reason: string }) => `\`devframe connect\` requires the optional peer dependency @modelcontextprotocol/server: ${p.reason}`,
      fix: 'Install it next to devframe (e.g. `npm install @modelcontextprotocol/server`) and run `devframe connect` again.',
    },
    DF0047: {
      why: (p: { name: string, id: string, existing: string }) =>
        `Agent tool "${p.id}" is hidden from the MCP surface: its wire name "${p.name}" collides with the tool "${p.existing}".`,
      fix: 'Wire names derive from tool ids (characters outside [a-zA-Z0-9_-] become "_"). Rename one of the two ids so they sanitize to distinct names.',
    },
    DF0048: {
      why: (p: { key: string }) => `Unknown shared-state key "${p.key}".`,
      fix: 'Call the devframe_state_read tool without arguments to list the available keys, then retry with one of them.',
    },
    DF0049: {
      why: 'The devframe_connect_call-tool tool requires { port: number, tool: string }.',
      fix: 'Call devframe_connect_list-instances to get the port and tool names, then retry.',
    },
    DF0050: {
      why: (p: { port: number }) => `No running devframe instance on port ${p.port}.`,
      fix: 'Call devframe_connect_list-instances for the current instance list — the instance may have stopped or changed port.',
    },
    DF0051: {
      why: (p: { port: number }) => `The devframe instance on port ${p.port} has no MCP endpoint.`,
      fix: 'Restart the instance with the --mcp flag (or set `cli.mcp: true` on its definition) to expose its tools, then list instances again.',
    },
    DF0052: {
      why: (p: { host: string, port: number, reason: string }) => `Failed to listen on ${p.host}:${p.port}: ${p.reason}`,
      fix: 'The port is likely already taken by another process (often a previous devframe instance). Free it, or pick another via `--port`, `cli.port` / `cli.portRange` on the definition, or `devMiddleware.port` on `viteDevBridge`. The original node error is available as `error.cause`.',
    },
    DF0053: {
      why: (p: { key: string, id: string }) => `createHandler("${p.id}") replaced the live handler memoized under key "${p.key}": its options changed since the previous call.`,
      fix: 'A dev-time module reload re-ran createHandler with different options, so the old instance (and its side-car WebSocket server) was closed and a new one started. If this is unexpected, keep the options stable across reloads — or use distinct keys for genuinely different handlers.',
    },
    DF0054: {
      why: (p: { id: string }) => `connectionMeta() was called before createHandler("${p.id}") finished initializing.`,
      fix: 'Await `handler.ready` (or any `handler.fetch` call) before reading `connectionMeta()` — the WebSocket binding it describes is only known once initialization completes.',
    },
  },
})
