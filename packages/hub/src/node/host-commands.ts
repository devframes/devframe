import type { AgentHandle } from 'devframe/types'
import type {
  DevframeCommandHandle,
  DevframeCommandsHost as DevframeCommandsHostType,
  DevframeServerCommandEntry,
  DevframeServerCommandInput,
} from '../types/commands'
import type { DevframeHubContext } from './context'
import { createEventEmitter } from 'devframe/utils/events'
import { valibotArgsToJsonSchema } from 'devframe/utils/valibot-json-schema'
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

  /** Agent-tool handles per command id (incl. children), for teardown/re-sync. */
  private readonly agentHandles = new Map<string, AgentHandle>()

  constructor(
    public readonly context: DevframeHubContext,
  ) {}

  register(command: DevframeServerCommandInput): DevframeCommandHandle {
    if (this.commands.has(command.id)) {
      throw diagnostics.DF8400({ id: command.id })
    }
    validateCommandIds(this.commands, command)
    this.validateAgentExposure(command)
    this.commands.set(command.id, command)
    this.events.emit('command:registered', this.toSerializable(command))
    this.registerAgentTools(command)

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
        // Re-sync the agent projection: drop the old tree's tools before the
        // patch lands, re-register from the patched command below.
        this.unregisterAgentTools(existing)
        Object.assign(existing, patch)
        this.events.emit('command:registered', this.toSerializable(existing))
        this.registerAgentTools(existing)
      },
      unregister: () => this.unregister(command.id),
    }
  }

  unregister(id: string): boolean {
    const command = this.commands.get(id)
    const deleted = this.commands.delete(id)
    if (deleted) {
      if (command)
        this.unregisterAgentTools(command)
      this.events.emit('command:unregistered', id)
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
    // `agent` stays server-side: it carries valibot schemas (not wire-safe)
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
   * Project every agent-flagged command in the tree into `ctx.agent` as a
   * callable tool. `when` clauses evaluate client-side only and are not
   * enforced here — opting in a `when`-gated command is a deliberate author
   * decision (documented on `DevframeCommandAgentOptions`).
   */
  private registerAgentTools(command: DevframeServerCommandInput): void {
    const agent = command.agent
    if (agent && command.handler) {
      const { schema, unwrapped } = valibotArgsToJsonSchema(agent.args)
      const handle = this.context.agent.registerTool({
        id: command.id,
        title: agent.title ?? command.title,
        description: agent.description,
        safety: agent.safety ?? 'action',
        tags: agent.tags,
        inputSchema: schema,
        handler: async (args: unknown) =>
          this.execute(command.id, ...coercePositionalArgs(args, agent.args, unwrapped)),
      })
      this.agentHandles.set(command.id, handle)
    }
    for (const child of command.children ?? [])
      this.registerAgentTools(child)
  }

  private unregisterAgentTools(command: DevframeServerCommandInput): void {
    for (const id of collectCommandIds(command)) {
      const handle = this.agentHandles.get(id)
      if (handle) {
        this.agentHandles.delete(id)
        handle.unregister()
      }
    }
  }
}

/**
 * Map the single-object args an MCP client sends onto the command handler's
 * positional parameters, mirroring the agent host's RPC coercion: no declared
 * schemas → zero-arg call; a single unwrapped object schema → the object
 * itself; positional schemas → `arg0..argN` keys in order.
 */
function coercePositionalArgs(
  args: unknown,
  schemas: readonly unknown[] | undefined,
  unwrapped: boolean,
): unknown[] {
  if (!schemas || schemas.length === 0)
    return []
  if (unwrapped)
    return [args ?? {}]
  const obj = (args ?? {}) as Record<string, unknown>
  return schemas.map((_, i) => obj[`arg${i}`])
}
