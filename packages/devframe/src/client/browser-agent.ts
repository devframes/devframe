import type { RpcFunctionAgentOptions } from 'devframe/rpc'

export interface BrowserAgentToolManifest {
  id: string
  title?: string
  description: string
  safety: 'read' | 'action' | 'destructive'
  tags?: readonly string[]
  inputSchema?: unknown
}

export interface BrowserAgentTool extends BrowserAgentToolManifest {
  invoke: (args: Record<string, unknown>) => unknown | Promise<unknown>
}

interface BrowserAgentRegistryState {
  tools: Map<symbol, BrowserAgentTool>
  listeners: Set<() => void>
}

const REGISTRY_KEY = Symbol.for('devframe:browser-agent-registry')
const state = ((globalThis as any)[REGISTRY_KEY] ??= {
  tools: new Map(),
  listeners: new Set(),
}) as BrowserAgentRegistryState
const { tools, listeners } = state

function notifyChanged(): void {
  for (const listener of listeners)
    listener()
}

export function registerBrowserAgentTool(tool: BrowserAgentTool): () => void {
  const key = Symbol(tool.id)
  tools.set(key, tool)
  notifyChanged()
  return () => {
    if (tools.delete(key))
      notifyChanged()
  }
}

export function listBrowserAgentTools(): BrowserAgentTool[] {
  const unique = new Map<string, BrowserAgentTool>()
  for (const tool of tools.values()) {
    if (!unique.has(tool.id))
      unique.set(tool.id, tool)
  }
  return [...unique.values()]
}

export function onBrowserAgentToolsChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resolveBrowserAgentSafety(
  type: string | undefined,
  agent: RpcFunctionAgentOptions,
): BrowserAgentToolManifest['safety'] {
  if (agent.safety)
    return agent.safety
  return type === 'static' || type === 'query' || type == null ? 'read' : 'action'
}
