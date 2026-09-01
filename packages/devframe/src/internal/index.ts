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
// - `createRpcWireCodec` / `peekRpcWireFrame` — the per-connection wire
//   codec (strict-JSON ⇄ structured-clone dispatch) and envelope peeker the
//   built-in WS/SSE transports share; a custom transport implementation
//   reuses them to speak the identical wire protocol.
// - `createH3DevframeHost` — the node/standalone `DevframeHost` implementation
//   (filesystem storage paths + origin resolution) passed to `createHostContext`.
// - `createInstanceShell` — the shared machinery behind `initDevframe` and
//   `initHub`: mount base, h3 app, lazy origin + auth banner, WebSocket
//   binding resolution ("listen on a port / share one + attach the WS
//   transport"), the fetch/connect handler pair, and teardown. `StartedServer`
//   is the live handle its bound tiers produce and `createDevServer` re-exposes.
// - `normalizeHttpServerUrl` — a small host-side URL helper.
// - `resolveBasePath` / `normalizeBasePath` — the mount-base resolution
//   `initDevframe` itself uses; a bridge (`@devframes/vite`) that mounts a
//   devframe onto a host it doesn't own reuses the exact same defaulting.
// - `resolveClientAssets` — the definition → static-assets-source
//   resolution every UI-serving adapter uses (`clientAssets`, falling back to
//   the legacy `cli.distDir`), so a bridge that serves a devframe's SPA itself
//   (`@devframes/vite`, `@devframes/next`, the hub's `ctx.install`) resolves it
//   identically.
// - `diagnostics` — devframe core's structured diagnostics instance
//   (`DF00xx`), so a first-party integration built outside this package can
//   report against the same registered codes instead of minting its own.
export { normalizeBasePath, resolveBasePath, resolveMcpConfig } from '../adapters/_shared'
export type { ResolvedMcpConfig } from '../adapters/_shared'
export { resolveClientAssets } from '../client-assets'
export { coerceAgentPositionalArgs } from '../node/agent-args'
export type { AgentArgsFallback } from '../node/agent-args'
export { diagnostics } from '../node/diagnostics'
export { DevframeAgentHost } from '../node/host-agent'
export * from '../node/host-h3'
export { importRuntimeModule } from '../node/import-runtime-module'
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
export { createRpcWireCodec, peekRpcWireFrame } from '../rpc/wire-codec'
export type { RpcWireCodec } from '../rpc/wire-codec'
