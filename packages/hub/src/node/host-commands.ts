import type { AgentToolInput, AgentToolProviderHandle } from 'devframe/types'
import type {
  DevframeCommandHandle,
  DevframeCommandsHost as DevframeCommandsHostType,
  DevframeServerCommandEntry,
  DevframeServerCommandInput,
} from '../types/commands'
import type { DevframeHubContext } from './context'
import { coerceAgentPositionalArgs } from 'devframe/internal'
import { createEventEmitter } from 'devframe/utils/events'
import { HUB_EVENTS } from '../events'
import { diagnostics } from './diagnostics'

function findChildCommand(command: DevframeServerCommandInput, id: string): DevframeServerCommandInput | undefined {
  for (const child of command.children ?? []) {
    if (child.id === id)
      return child
    const nested = findChildCommand(child, id)
    if (nested)
      return nested
  }
  return undefined
}

function collectCommandIds(command: DevframeServerCommandInput, ids: string[] = []): string[] {
  ids.push(command.id)
  for (const child of command.children ?? [])
    collectCommandIds(child, ids)
  return ids
}

function validateCommandIds(
  commands: Map<string, DevframeServerCommandInput>,
  command: DevframeServerCommandInput,
  ignoreTopLevelId?: string,
): void {
  const ids = collectCommandIds(command)
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id))
      throw diagnostics.DF8403({ id })
    seen.add(id)
  }

  for (const [registeredId, registered] of commands) {
    if (registeredId === ignoreTopLevelId)
      continue
    const registeredIds = new Set(collectCommandIds(registered))
    for (const id of ids) {
      if (registeredIds.has(id))
        throw diagnostics.DF8403({ id })
    }
  }
}

export class DevframeCommandsHost implements DevframeCommandsHostType {
  public readonly commands: DevframeCommandsHostType['commands'] = new Map()
  public readonly events: DevframeCommandsHostType['events'] = createEventEmitter()

  /**
   * Lazy agent projection: `ctx.agent` queries this provider at list/invoke
   * time, deriving tools from {@link commands} on demand — the commands map
   * stays the single source of truth, nothing is mirrored or kept in sync.
   */
  private readonly agentProvider: AgentToolProviderHandle | undefined

  constructor(
    public readonly context: DevframeHubContext,
  ) {
    this.agentProvider = context.agent?.registerToolProvider(() => this.collectAgentTools())
  }

  register(command: DevframeServerCommandInput): DevframeCommandHandle {
    if (this.commands.has(command.id)) {
      throw diagnostics.DF8400({ id: command.id })
    }
    validateCommandIds(this.commands, command)
    this.validateAgentExposure(command)
    this.commands.set(command.id, command)
    this.events.emit(HUB_EVENTS.bus.commandsRegistered, this.toSerializable(command))
    this.agentProvider?.notifyChanged()

    return {
      id: command.id,
      update: (patch: Partial<Omit<DevframeServerCommandInput, 'id'>>) => {
        if ('id' in patch) {
          throw diagnostics.DF8401()
        }
        const existing = this.commands.get(command.id)
        if (!existing) {
          throw diagnostics.DF8402({ id: command.id })
        }
        const next = {
          ...existing,
          ...patch,
          id: existing.id,
        }
        validateCommandIds(this.commands, next, existing.id)
        this.validateAgentExposure(next)
        Object.assign(existing, patch)
        this.events.emit(HUB_EVENTS.bus.commandsRegistered, this.toSerializable(existing))
        this.agentProvider?.notifyChanged()
      },
      unregister: () => this.unregister(command.id),
    }
  }

  unregister(id: string): boolean {
    const deleted = this.commands.delete(id)
    if (deleted) {
      this.events.emit(HUB_EVENTS.bus.commandsUnregistered, id)
      this.agentProvider?.notifyChanged()
    }
    return deleted
  }

  async execute(id: string, ...args: any[]): Promise<unknown> {
    const found = this.findCommand(id)
    if (!found) {
      throw diagnostics.DF8402({ id })
    }
    if (!found.handler) {
      throw new Error(`Command "${id}" has no handler (group-only command)`)
    }
    return found.handler(...args)
  }

  list(): DevframeServerCommandEntry[] {
    return Array.from(this.commands.values()).map(cmd => this.toSerializable(cmd))
  }

  private findCommand(id: string): DevframeServerCommandInput | undefined {
    // Check top-level
    const topLevel = this.commands.get(id)
    if (topLevel)
      return topLevel

    // Search children
    for (const cmd of this.commands.values()) {
      const child = findChildCommand(cmd, id)
      if (child)
        return child
    }

    return undefined
  }

  private toSerializable(cmd: DevframeServerCommandInput): DevframeServerCommandEntry {
    // `agent` stays server-side: it carries Standard Schema validators (not wire-safe)
    // and only concerns the agent projection, not the palette.
    const { handler: _, agent: __, children, ...rest } = cmd
    return {
      ...rest,
      source: 'server',
      ...(children
        ? { children: children.map((c: DevframeServerCommandInput) => this.toSerializable(c)) }
        : {}
      ),
    }
  }

  /** Reject `agent` on handler-less commands anywhere in the tree, up front. */
  private validateAgentExposure(command: DevframeServerCommandInput): void {
    if (command.agent && !command.handler)
      throw diagnostics.DF8404({ id: command.id })
    for (const child of command.children ?? [])
      this.validateAgentExposure(child)
  }

  /**
   * Derive the agent-tool projection of the current command trees: every
   * agent-flagged, handler-bearing command (children included) becomes a
   * callable tool. Queried lazily by the provider registered in the
   * constructor. `when` clauses evaluate client-side only and are not
   * enforced here — opting in a `when`-gated command is a deliberate author
   * decision (documented on `DevframeCommandAgentOptions`).
   */
  private collectAgentTools(): AgentToolInput[] {
    const tools: AgentToolInput[] = []
    const walk = (command: DevframeServerCommandInput): void => {
      const agent = command.agent
      if (agent && command.handler) {
        tools.push({
          id: command.id,
          title: agent.title ?? command.title,
          description: agent.description,
          safety: agent.safety ?? 'action',
          tags: agent.tags,
          // The agent host derives the tool's JSON-Schema input from these.
          args: agent.args,
          // A command handler's positional parameters come solely from its
          // declared `agent.args` schemas — undeclared payload is dropped.
          handler: async (args: unknown) =>
            this.execute(command.id, ...coerceAgentPositionalArgs(args, agent.args, 'drop')),
        })
      }
      for (const child of command.children ?? [])
        walk(child)
    }
    for (const command of this.commands.values())
      walk(command)
    return tools
  }
}
