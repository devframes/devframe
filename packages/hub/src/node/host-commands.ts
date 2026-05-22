import type {
  DevToolsCommandHandle,
  DevToolsCommandsHost as DevToolsCommandsHostType,
  DevToolsServerCommandEntry,
  DevToolsServerCommandInput,
} from '../types/commands'
import type { HubNodeContext } from './context'
import { createEventEmitter } from 'devframe/utils/events'
import { diagnostics } from './diagnostics'

function findChildCommand(command: DevToolsServerCommandInput, id: string): DevToolsServerCommandInput | undefined {
  for (const child of command.children ?? []) {
    if (child.id === id)
      return child
    const nested = findChildCommand(child, id)
    if (nested)
      return nested
  }
  return undefined
}

function collectCommandIds(command: DevToolsServerCommandInput, ids: string[] = []): string[] {
  ids.push(command.id)
  for (const child of command.children ?? [])
    collectCommandIds(child, ids)
  return ids
}

function validateCommandIds(
  commands: Map<string, DevToolsServerCommandInput>,
  command: DevToolsServerCommandInput,
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

export class DevToolsCommandsHost implements DevToolsCommandsHostType {
  public readonly commands: DevToolsCommandsHostType['commands'] = new Map()
  public readonly events: DevToolsCommandsHostType['events'] = createEventEmitter()

  constructor(
    public readonly context: HubNodeContext,
  ) {}

  register(command: DevToolsServerCommandInput): DevToolsCommandHandle {
    if (this.commands.has(command.id)) {
      throw diagnostics.DF8400({ id: command.id })
    }
    validateCommandIds(this.commands, command)
    this.commands.set(command.id, command)
    this.events.emit('command:registered', this.toSerializable(command))

    return {
      id: command.id,
      update: (patch: Partial<Omit<DevToolsServerCommandInput, 'id'>>) => {
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
        Object.assign(existing, patch)
        this.events.emit('command:registered', this.toSerializable(existing))
      },
      unregister: () => this.unregister(command.id),
    }
  }

  unregister(id: string): boolean {
    const deleted = this.commands.delete(id)
    if (deleted) {
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

  list(): DevToolsServerCommandEntry[] {
    return Array.from(this.commands.values()).map(cmd => this.toSerializable(cmd))
  }

  private findCommand(id: string): DevToolsServerCommandInput | undefined {
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

  private toSerializable(cmd: DevToolsServerCommandInput): DevToolsServerCommandEntry {
    const { handler: _, children, ...rest } = cmd
    return {
      ...rest,
      source: 'server',
      ...(children
        ? { children: children.map((c: DevToolsServerCommandInput) => this.toSerializable(c)) }
        : {}
      ),
    }
  }
}
