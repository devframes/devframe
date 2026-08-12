// Node-side public API for building a devframe context: `createHostContext`
// (the context assembler) and `createStorage`.
//
// The server-assembly primitives (`createH3DevframeHost`, `startHttpAndWs`) and
// everything lower-level live at `devframe/internal` (an explicitly-unstable
// cross-package surface): the transport-agnostic RPC core, the agent host, the
// instance registry, and the `normalizeHttpServerUrl` helper. Application code
// serves a devframe through the adapters (`createDevServer`, `createBuild`,
// `createCac`) or `devframe/initiate`. The diagnostics/services/views hosts,
// the streaming/shared-state/scope/settings factories, and the internal
// host-URL helpers stay fully internal (relative imports only).
// `toAgentToolName` lives at `devframe/utils/agent-tool-name`.
export * from './context'
// `RpcFunctionsHostImpl` stays internal; expose only the structural
// `RpcFunctionsHost` type so consumers can type/cast `ctx.rpc` without
// pulling in the implementation's `@internal` members.
export type { RpcFunctionsHost } from './host-functions'
export * from './storage'
