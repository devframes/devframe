import type { AgentToolInput, DevframeAgentHost, DevframeNodeRpcSessionMeta } from 'devframe/types'
import type { BrowserAgentClientInfo, BrowserAgentToolManifest } from '../client/browser-agent'
import { diagnostics } from './diagnostics'

interface ClientAgentContext {
  agent: Pick<DevframeAgentHost, 'registerToolProvider'>
}

interface ClientAgentSession {
  meta: DevframeNodeRpcSessionMeta
  rpc: {
    $callRaw: (request: { method: string, args: unknown[] }) => Promise<unknown>
  }
}

interface ClientAgentEntry {
  session: ClientAgentSession
  /** Stable per-tab id the browser reports, so reconnecting tabs stay identifiable (see #394). */
  clientId: string
  info: BrowserAgentClientInfo
  tools: BrowserAgentToolManifest[]
  connectedAt: number
  syncedAt: number
  /** Last sync that reported `focused: true`; 0 when the tab was never focused while connected. */
  focusedAt: number
}

type ClientAgentSessions = Map<DevframeNodeRpcSessionMeta, ClientAgentEntry>

interface ClientAgentState {
  sessions: ClientAgentSessions
  notifyChanged: () => void
}

/** Id of the built-in tool listing connected browser tabs (wire name `devframe_agent_list-clients`). */
export const LIST_CLIENTS_TOOL = 'devframe:agent:list-clients'

/** Reserved argument a forwarded client tool accepts to address one tab. */
const CLIENT_ID_ARG = 'client_id'

/** One connected browser tab as reported by {@link LIST_CLIENTS_TOOL}. */
export interface ConnectedClient extends BrowserAgentClientInfo {
  id: string
  connectedAt: number
  tools: string[]
}

const states = new WeakMap<ClientAgentContext, ClientAgentState>()

/**
 * Prefer the most recently focused visible tab, then any visible tab, then
 * whichever synced last. Ties go to the later entry, so a re-sync moves a
 * tab ahead of its peers.
 */
function pickTarget(candidates: Iterable<ClientAgentEntry>): ClientAgentEntry | undefined {
  const rank = (e: ClientAgentEntry): number[] => e.info.visible ? [1, e.focusedAt, e.syncedAt] : [0, 0, e.syncedAt]
  let best: ClientAgentEntry | undefined
  for (const entry of candidates) {
    if (!best) {
      best = entry
      continue
    }
    const a = rank(entry)
    const b = rank(best)
    const i = a.findIndex((v, i) => v !== b[i])
    if (i === -1 || a[i]! > b[i]!)
      best = entry
  }
  return best
}

function withClientIdArg(inputSchema: unknown): unknown {
  const base = inputSchema && typeof inputSchema === 'object' ? inputSchema as { properties?: Record<string, unknown> } : {}
  return {
    type: 'object',
    ...base,
    properties: {
      ...base.properties,
      [CLIENT_ID_ARG]: {
        type: 'string',
        description: `Id of the connected browser tab to run this on, from ${LIST_CLIENTS_TOOL}. Omit to target the most recently focused tab.`,
      },
    },
  }
}

function listClients(sessions: ClientAgentSessions): ConnectedClient[] {
  return [...sessions.values()].map(entry => ({
    id: entry.clientId,
    ...entry.info,
    connectedAt: entry.connectedAt,
    tools: entry.tools.map(tool => tool.id),
  }))
}

function forwardedTool(sessions: ClientAgentSessions, manifest: BrowserAgentToolManifest): AgentToolInput {
  return {
    ...manifest,
    inputSchema: withClientIdArg(manifest.inputSchema),
    handler: (args: Record<string, unknown> | undefined) => {
      const { [CLIENT_ID_ARG]: clientId, ...rest } = args ?? {}
      const candidates = [...sessions.values()].filter(e =>
        e.tools.some(t => t.id === manifest.id)
        && (clientId === undefined || e.clientId === clientId),
      )
      const target = pickTarget(candidates)
      if (!target) {
        throw diagnostics.DF0081({
          clientId: String(clientId),
          tool: manifest.id,
          live: [...sessions.values()].map(e => e.clientId),
        })
      }
      return target.session.rpc.$callRaw({
        method: 'devframe:agent:invoke-client-tool',
        args: [manifest.id, rest],
      })
    },
  }
}

function listClientsTool(sessions: ClientAgentSessions): AgentToolInput {
  return {
    id: LIST_CLIENTS_TOOL,
    title: 'List connected browser tabs',
    description: `List every browser tab connected to this devframe: its client id, URL, title, visibility/focus, and the tools it exposes. Pass a client id as \`${CLIENT_ID_ARG}\` to a client tool to run it on that tab. Safe to call freely.`,
    safety: 'read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: {
        clients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              url: { type: 'string' },
              title: { type: 'string' },
              visible: { type: 'boolean' },
              focused: { type: 'boolean' },
              connectedAt: { type: 'number' },
              tools: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    handler: () => ({ clients: listClients(sessions) }),
  }
}

function getState(context: ClientAgentContext): ClientAgentState {
  let state = states.get(context)
  if (state)
    return state

  const sessions: ClientAgentSessions = new Map()
  const provider = context.agent.registerToolProvider(() => {
    if (sessions.size === 0)
      return []
    // One entry per tool id however many tabs expose it; the handler picks
    // the tab at call time.
    const tools = new Map<string, AgentToolInput>()
    for (const entry of sessions.values()) {
      for (const manifest of entry.tools) {
        if (!tools.has(manifest.id))
          tools.set(manifest.id, forwardedTool(sessions, manifest))
      }
    }
    tools.set(LIST_CLIENTS_TOOL, listClientsTool(sessions))
    return [...tools.values()]
  })
  state = { sessions, notifyChanged: provider.notifyChanged }
  states.set(context, state)
  return state
}

export function syncClientAgentTools(
  context: ClientAgentContext,
  session: ClientAgentSession,
  clientId: string,
  tools: BrowserAgentToolManifest[],
  info: BrowserAgentClientInfo,
): void {
  const state = getState(context)
  const now = Date.now()
  const previous = state.sessions.get(session.meta)
  state.sessions.set(session.meta, {
    session,
    clientId,
    info,
    tools,
    connectedAt: previous?.connectedAt ?? now,
    syncedAt: now,
    focusedAt: info.focused ? now : previous?.focusedAt ?? 0,
  })
  // Focus/visibility re-syncs leave the tool surface as it was.
  const sameTools = previous && previous.tools.length === tools.length
    && previous.tools.every((tool, i) => tool.id === tools[i]!.id)
  if (!sameTools)
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
