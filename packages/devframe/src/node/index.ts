// Node-side public API for consumers that wire up their own runtime.
// `toAgentToolName` lives at `devframe/utils/agent-tool-name` instead — a
// plain string transform, client-safe (the inspect plugin's UI imports it
// too), not node-specific.
export * from './agent-args'
export * from './context'
export * from './host-agent'
export * from './host-diagnostics'
// `RpcFunctionsHostImpl` stays internal; expose only the structural
// `RpcFunctionsHost` type so consumers can type/cast `ctx.rpc` without
// pulling in the implementation's `@internal` members.
export type { RpcFunctionsHost } from './host-functions'
export * from './host-h3'
export * from './host-services'
export * from './host-views'
// Only registration is public — custom hosts (e.g. @devframes/next) record
// themselves; the read/probe/prune helpers stay internal to the connector.
export { registerDevframeInstance } from './instance-registry'
export type { DevframeInstanceRecord, DevframeInstanceRegistration } from './instance-registry'
export * from './rpc-shared-state'
export * from './rpc-streaming'
export * from './scope'
export * from './server'
export * from './settings'
export * from './storage'
export * from './utils'
