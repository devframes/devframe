// Node-side public API for hosts that wire up their own runtime — the
// server-assembly surface (`createHostContext` → `startHttpAndWs`), the
// transport-agnostic RPC core (`createContextRpcServer`), the instance
// registry, storage, and the two URL/host helpers consumers use.
//
// The diagnostics/services/views hosts, the streaming/shared-state/scope/
// settings factories, and the internal host helpers (`toDialableHost`,
// `formatHostForUrl`) stay internal. `toAgentToolName` lives at
// `devframe/utils/agent-tool-name` (a client-safe string transform).
//
// `coerceAgentPositionalArgs`, the `DevframeAgentHost` class, and
// `createContextRpcServer` stay public because `@devframes/hub` composes its
// own commands/agent host and hand-rolled server on top of them — the exact
// custom-transport path `createContextRpcServer` exists for.
export { coerceAgentPositionalArgs } from './agent-args'
export * from './context'
export { DevframeAgentHost } from './host-agent'
// `RpcFunctionsHostImpl` stays internal; expose only the structural
// `RpcFunctionsHost` type so consumers can type/cast `ctx.rpc` without
// pulling in the implementation's `@internal` members.
export type { RpcFunctionsHost } from './host-functions'
export * from './host-h3'
// Registration is public — custom hosts (e.g. @devframes/next) record
// themselves — and live discovery is public too, so surfaces like the
// inspect plugin's Instances tab can enumerate running instances. The
// lower-level read/probe/prune helpers stay internal to the connector.
export { listLiveDevframeInstances, registerDevframeInstance } from './instance-registry'
export type { DevframeInstanceRecord, DevframeInstanceRegistration } from './instance-registry'
// The transport-agnostic RPC core is public so hosts that bind their own
// transports (a Bun fetch-upgrade route, a custom relay — e.g. `initHub`)
// reuse the exact session/auth wiring `startHttpAndWs` uses.
export * from './rpc-core'
export * from './server'
export * from './storage'
export { isObject, normalizeHttpServerUrl } from './utils'
