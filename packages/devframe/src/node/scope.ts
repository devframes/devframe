import type { RpcFunctionDefinition } from 'devframe/rpc'
import type { DevframeNodeContext, DevframeScopedNodeContext, DevframeScopedNodeRpc } from 'devframe/types'
import { isQualifiedName, qualifyName } from 'devframe/utils/scope'
import { diagnostics } from './diagnostics'
import { createNodeSettings } from './settings'

function prefixDefinition(
  namespace: string,
  fn: RpcFunctionDefinition<string, any, any, any, any, any, DevframeNodeContext>,
): RpcFunctionDefinition<string, any, any, any, any, any, DevframeNodeContext> {
  if (isQualifiedName(fn.name))
    throw diagnostics.DF0034({ namespace, name: fn.name })
  return { ...fn, name: `${namespace}:${fn.name}` }
}

/**
 * Build a namespace-scoped view of a {@link DevframeNodeContext}. Every
 * RPC id, shared-state key, and streaming channel passed through the
 * returned `rpc` surface is auto-namespaced with `<namespace>:`.
 */
export function createScopedNodeContext<NS extends string = string>(
  context: DevframeNodeContext,
  namespace: NS,
): DevframeScopedNodeContext<NS> {
  const base = context.rpc

  const rpc: DevframeScopedNodeRpc<NS> = {
    namespace,
    register(fn, force) {
      base.register(prefixDefinition(namespace, fn), force)
    },
    update(fn, force) {
      base.update(prefixDefinition(namespace, fn), force)
    },
    call: ((method: string, ...args: any[]) =>
      base.invokeLocal(qualifyName(namespace, method) as any, ...args)) as DevframeScopedNodeRpc<NS>['call'],
    broadcast: ((options: { method: string }) =>
      base.broadcast({ ...options, method: qualifyName(namespace, options.method) } as any)) as DevframeScopedNodeRpc<NS>['broadcast'],
    sharedState: ((key: string, options?: any) =>
      (base.sharedState.get as any)(qualifyName(namespace, key), options)) as DevframeScopedNodeRpc<NS>['sharedState'],
    streaming: {
      create: (name, opts) => base.streaming.create(qualifyName(namespace, name), opts),
    },
    getCurrentRpcSession: () => base.getCurrentRpcSession(),
  }

  return {
    namespace,
    base: context,
    cwd: context.cwd,
    workspaceRoot: context.workspaceRoot,
    mode: context.mode,
    host: context.host,
    rpc,
    settings: createNodeSettings(context, namespace),
    views: context.views,
    diagnostics: context.diagnostics,
    agent: context.agent,
    scope: context.scope,
  }
}
