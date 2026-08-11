// Internal cross-package surface: low-level primitives shared between
// `devframe` and its first-party integrations (`@devframes/hub`, the inspect
// plugin, `@vitejs/devtools`, custom hosts). These are NOT part of the stable
// public API — they can change in any minor release. Application code should
// use `devframe/node` and the adapters instead.
//
// - `createContextRpcServer` — the transport-agnostic RPC core; a host that
//   binds its own transport (e.g. the hub's `initHub`) reuses the exact
//   session/auth wiring `startHttpAndWs` uses.
// - `DevframeAgentHost` — the agent host implementation the hub composes into
//   its own commands host.
// - `coerceAgentPositionalArgs` — positional-arg coercion the hub applies when
//   invoking agent tools as commands.
// - `registerDevframeInstance` / `listLiveDevframeInstances` — the instance
//   registry: a custom host advertises itself; a devtool (the inspect plugin's
//   Instances tab, the connector) enumerates what's running.
// - `isObject` / `normalizeHttpServerUrl` — small host-side helpers a
//   hand-rolled host reuses to match devframe's own config/URL handling.
export { coerceAgentPositionalArgs } from '../node/agent-args'
export type { AgentArgsFallback } from '../node/agent-args'
export { DevframeAgentHost } from '../node/host-agent'
export { listLiveDevframeInstances, registerDevframeInstance } from '../node/instance-registry'
export type { DevframeInstanceRecord, DevframeInstanceRegistration } from '../node/instance-registry'
export { createContextRpcServer } from '../node/rpc-core'
export type { ContextRpcServer, CreateContextRpcServerOptions } from '../node/rpc-core'
export { isObject, normalizeHttpServerUrl } from '../node/utils'
