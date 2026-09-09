import type { AgentToolInput, DevframeAgentHost, DevframeNodeRpcSessionMeta } from 'devframe/types'
import type { BrowserAgentToolManifest } from '../client/browser-agent'

interface ClientAgentContext {
  agent: Pick<DevframeAgentHost, 'registerToolProvider'>
}

interface ClientAgentSession {
  meta: DevframeNodeRpcSessionMeta
  rpc: {
    $callRaw: (request: { method: string, args: unknown[] }) => Promise<unknown>
  }
}

interface ClientAgentState {
  sessions: Map<DevframeNodeRpcSessionMeta, {
    session: ClientAgentSession
    tools: BrowserAgentToolManifest[]
  }>
  notifyChanged: () => void
}

const states = new WeakMap<ClientAgentContext, ClientAgentState>()

function getState(context: ClientAgentContext): ClientAgentState {
  let state = states.get(context)
  if (state)
    return state

  const sessions: ClientAgentState['sessions'] = new Map()
  const provider = context.agent.registerToolProvider(() => {
    const tools = new Map<string, AgentToolInput>()
    for (const { session, tools: manifests } of sessions.values()) {
      for (const manifest of manifests) {
        if (tools.has(manifest.id))
          continue
        tools.set(manifest.id, {
          ...manifest,
          handler: args => session.rpc.$callRaw({
            method: 'devframe:agent:invoke-client-tool',
            args: [manifest.id, args],
          }),
        })
      }
    }
    return [...tools.values()]
  })
  state = { sessions, notifyChanged: provider.notifyChanged }
  states.set(context, state)
  return state
}

export function syncClientAgentTools(
  context: ClientAgentContext,
  session: ClientAgentSession,
  tools: BrowserAgentToolManifest[],
): void {
  const state = getState(context)
  state.sessions.set(session.meta, { session, tools })
  state.notifyChanged()
}

export function removeClientAgentSession(
  context: ClientAgentContext,
  meta: DevframeNodeRpcSessionMeta,
): void {
  const state = states.get(context)
  if (state?.sessions.delete(meta))
    state.notifyChanged()
}
