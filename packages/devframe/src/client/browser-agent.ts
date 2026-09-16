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
  return [...tools.values()]
}

export function onBrowserAgentToolsChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
