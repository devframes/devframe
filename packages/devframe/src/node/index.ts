// Node-side public API for hosts that wire up their own runtime — the
// server-assembly surface (`createHostContext` → `createH3DevframeHost` →
// `startHttpAndWs`) and storage.
//
// Everything lower-level lives at `devframe/internal` (an explicitly-unstable
// cross-package surface): the transport-agnostic RPC core, the agent host, the
// instance registry (host self-registration + live discovery), and the
// `isObject` / `normalizeHttpServerUrl` helpers. The diagnostics/services/views
// hosts, the streaming/shared-state/scope/settings factories, and the internal
// host-URL helpers stay fully internal (relative imports only).
// `toAgentToolName` lives at `devframe/utils/agent-tool-name`.
export * from './context'
// `RpcFunctionsHostImpl` stays internal; expose only the structural
// `RpcFunctionsHost` type so consumers can type/cast `ctx.rpc` without
// pulling in the implementation's `@internal` members.
export type { RpcFunctionsHost } from './host-functions'
export * from './host-h3'
export * from './server'
export * from './storage'
