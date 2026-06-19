import type { RpcFunctionDefinitionAny } from 'devframe/rpc'
import type { DevframeHost, DevframeNodeContext, DevframeScopedNodeContext } from 'devframe/types'
import { diagnostics as rpcDiagnostics } from '../rpc/diagnostics'
import { diagnostics as devframeDiagnostics } from './diagnostics'
import { DevframeAgentHost } from './host-agent'
import { DevframeDiagnosticsHost } from './host-diagnostics'
import { RpcFunctionsHost } from './host-functions'
import { DevframeViewHost } from './host-views'
import { BUILTIN_AGENT_RPC } from './rpc'
import { createScopedNodeContext } from './scope'

export interface CreateHostContextOptions {
  cwd: string
  workspaceRoot?: string
  mode: 'dev' | 'build'
  host: DevframeHost
  /**
   * Built-in RPC declarations to register on the host. Framework
   * adapters (vite, rolldown, cli) can pass the ones they need; the
   * host itself has no opinions about the built-in set.
   */
  builtinRpcDeclarations?: readonly RpcFunctionDefinitionAny[]
}

/**
 * Framework- and build-tool-agnostic core of the Devframe node context.
 * Wires the RPC host, view (HTTP file-serving) host, diagnostics, and
 * agent subsystems. Host adapters can wrap this to augment `ctx` with
 * extra surfaces — for example, `@vitejs/devtools-kit`'s
 * `createKitContext` attaches `docks`, `terminals`, `messages`,
 * `commands`, and `createJsonRenderer` when mounted into Vite DevTools.
 */
export async function createHostContext(options: CreateHostContextOptions): Promise<DevframeNodeContext> {
  const { cwd, workspaceRoot = cwd, mode, host, builtinRpcDeclarations = [] } = options

  const context: DevframeNodeContext = {
    cwd,
    workspaceRoot,
    mode,
    host,
    rpc: undefined!,
    views: undefined!,
    diagnostics: undefined!,
    agent: undefined!,
    scope: undefined!,
  } as unknown as DevframeNodeContext

  const rpcHost = new RpcFunctionsHost(context)
  const viewsHost = new DevframeViewHost(context)
  const diagnosticsHost = new DevframeDiagnosticsHost(context, [devframeDiagnostics, rpcDiagnostics])
  context.rpc = rpcHost
  context.views = viewsHost
  context.diagnostics = diagnosticsHost

  // Agent host must be constructed after `rpcHost` so it can subscribe
  // to `onChanged` — it auto-discovers RPC functions flagged with
  // the `agent` field.
  const agentHost = new DevframeAgentHost(context)
  context.agent = agentHost

  // Namespace-scoped views are memoized per namespace so repeated
  // `ctx.scope('my-plugin')` calls return a stable object.
  const scopedCache = new Map<string, DevframeScopedNodeContext<string>>()
  context.scope = ((namespace?: string | null) => {
    if (!namespace)
      return context
    let scoped = scopedCache.get(namespace)
    if (!scoped) {
      scoped = createScopedNodeContext(context, namespace)
      scopedCache.set(namespace, scoped)
    }
    return scoped
  }) as DevframeNodeContext['scope']

  // Auto-register devframe's own agent introspection RPCs. These power
  // the MCP adapter and any future agent CLI. They are not themselves
  // agent-exposed (no `agent` field).
  for (const fn of BUILTIN_AGENT_RPC) {
    rpcHost.register(fn)
  }

  for (const fn of builtinRpcDeclarations) {
    rpcHost.register(fn)
  }

  return context
}
