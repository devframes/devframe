// Internal cross-package surface: low-level primitives shared between
// `devframe` and its first-party integrations (`@devframes/hub`, the inspect
// plugin, `@vitejs/devtools`, custom hosts). These are NOT part of the stable
// public API — they can change in any minor release. Application code should
// use `devframe/node` and the adapters instead.
//
// - `createContextRpcServer` — the transport-agnostic RPC core; a host that
//   binds its own transport (e.g. the hub's `initHub`) reuses the exact
//   session/auth wiring the instance shell's own binding uses.
// - `DevframeAgentHost` — the agent host implementation the hub composes into
//   its own commands host.
// - `coerceAgentPositionalArgs` — positional-arg coercion the hub applies when
//   invoking agent tools as commands.
// - `registerDevframeInstance` / `listLiveDevframeInstances` — the instance
//   registry: a custom host advertises itself; a devtool (the inspect plugin's
//   Instances tab, the connector) enumerates what's running.
// - `createH3DevframeHost` — the node/standalone `DevframeHost` implementation
//   (filesystem storage paths + origin resolution) passed to `createHostContext`.
// - `createInstanceShell` — the shared machinery behind `initDevframe` and
//   `initHub`: mount base, h3 app, lazy origin + auth banner, WebSocket
//   binding resolution ("listen on a port / share one + attach the WS
//   transport"), the fetch/connect handler pair, and teardown. `StartedServer`
//   is the live handle its bound tiers produce and `createDevServer` re-exposes.
// - `normalizeHttpServerUrl` — a small host-side URL helper.
export { coerceAgentPositionalArgs } from '../node/agent-args'
export type { AgentArgsFallback } from '../node/agent-args'
export { DevframeAgentHost } from '../node/host-agent'
export * from '../node/host-h3'
export { listLiveDevframeInstances, registerDevframeInstance } from '../node/instance-registry'
export type { DevframeInstanceRecord, DevframeInstanceRegistration } from '../node/instance-registry'
export { createInstanceShell, resolveInstanceRegister, samePath } from '../node/instance-shell'
export type {
  CreateInstanceShellOptions,
  InstanceRegisterConfig,
  InstanceShell,
  InstanceShellApi,
  InstanceShellInit,
  InstanceShellInternals,
  InstanceWsTier,
  StartedServer,
} from '../node/instance-shell'
export { createContextRpcServer } from '../node/rpc-core'
export type { ContextRpcServer, CreateContextRpcServerOptions } from '../node/rpc-core'
export { normalizeHttpServerUrl } from '../node/utils'
