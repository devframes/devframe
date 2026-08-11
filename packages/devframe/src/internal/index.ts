// Internal cross-package surface: low-level host primitives shared between
// `devframe` and `@devframes/hub` (and any first-party host built on the same
// wiring). These are NOT part of the stable public API — they can change in any
// minor release. Application code should use `devframe/node` and the adapters
// instead.
//
// - `createContextRpcServer` — the transport-agnostic RPC core; a host that
//   binds its own transport (e.g. the hub's `initHub`) reuses the exact
//   session/auth wiring `startHttpAndWs` uses.
// - `DevframeAgentHost` — the agent host implementation the hub composes into
//   its own commands host.
// - `coerceAgentPositionalArgs` — positional-arg coercion the hub applies when
//   invoking agent tools as commands.
export { coerceAgentPositionalArgs } from '../node/agent-args'
export type { AgentArgsFallback } from '../node/agent-args'
export { DevframeAgentHost } from '../node/host-agent'
export { createContextRpcServer } from '../node/rpc-core'
export type { ContextRpcServer, CreateContextRpcServerOptions } from '../node/rpc-core'
