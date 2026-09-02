import type { RpcFunctionDefinitionAnyWithContext, RpcFunctionType } from 'devframe/rpc'
import type {
  AgentHandle,
  AgentManifest,
  AgentResource,
  AgentResourceContent,
  AgentResourceInput,
  AgentTool,
  AgentToolInput,
  AgentToolProvider,
  AgentToolProviderHandle,
  DevframeAgentHostEvents,
  DevframeAgentHost as DevframeAgentHostType,
  DevframeNodeContext,
  EventEmitter,
  RpcFunctionAgentOptions,
} from 'devframe/types'
import { createEventEmitter } from 'devframe/utils/events'
import { DEVFRAME_EVENTS } from '../events'
import { coerceAgentPositionalArgs } from './agent-args'
import { diagnostics } from './diagnostics'

interface RegisteredTool {
  readonly tool: AgentTool
  readonly handler?: (args: any) => unknown | Promise<unknown>
}

interface RegisteredResource {
  readonly resource: AgentResource
  readonly read: () => Promise<AgentResourceContent> | AgentResourceContent
}

/**
 * Framework-neutral host aggregating the agent-exposed surface of a
 * devframe. Auto-discovers RPC functions with an `agent` field from
 * `ctx.rpc.definitions`, and accepts plugin-registered tools /
 * resources via `registerTool` / `registerResource`.
 */
export class DevframeAgentHost implements DevframeAgentHostType {
  public readonly events: EventEmitter<DevframeAgentHostEvents> = createEventEmitter()

  private readonly tools = new Map<string, RegisteredTool>()
  private readonly resources = new Map<string, RegisteredResource>()
  private readonly providers = new Set<AgentToolProvider>()
  private _rpcUnsubscribe: (() => void) | undefined

  constructor(
    public readonly context: DevframeNodeContext,
  ) {
    // Watch the RPC host for new `agent`-flagged definitions.
    this._rpcUnsubscribe = context.rpc.onChanged(() => {
      this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged)
    })
  }

  registerTool(input: AgentToolInput): AgentHandle {
    this._validateToolId(input.id)

    const tool = this._projectTool(input)
    this.tools.set(tool.id, { tool, handler: input.handler })
    this.events.emit(DEVFRAME_EVENTS.bus.agentToolRegistered, tool)
    this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged)

    return {
      unregister: () => this.unregisterTool(tool.id),
    }
  }

  unregisterTool(id: string): boolean {
    const existed = this.tools.delete(id)
    if (existed) {
      this.events.emit(DEVFRAME_EVENTS.bus.agentToolUnregistered, id)
      this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged)
    }
    return existed
  }

  registerToolProvider(provider: AgentToolProvider): AgentToolProviderHandle {
    this.providers.add(provider)
    this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged)

    const notifyChanged = (): void => {
      if (this.providers.has(provider))
        this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged)
    }
    return {
      notifyChanged,
      unregister: () => {
        if (this.providers.delete(provider))
          this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged)
      },
    }
  }

  registerResource(input: AgentResourceInput): AgentHandle {
    if (this.resources.has(input.id))
      throw diagnostics.DF0016({ id: input.id })

    const resource: AgentResource = {
      id: input.id,
      name: input.name,
      description: input.description,
      mimeType: input.mimeType ?? 'application/json',
      uri: input.uri ?? `devframe://resource/${encodeURIComponent(input.id)}`,
    }
    this.resources.set(resource.id, { resource, read: input.read })
    this.events.emit(DEVFRAME_EVENTS.bus.agentResourceRegistered, resource)
    this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged)

    return {
      unregister: () => this.unregisterResource(resource.id),
    }
  }

  unregisterResource(id: string): boolean {
    const existed = this.resources.delete(id)
    if (existed) {
      this.events.emit(DEVFRAME_EVENTS.bus.agentResourceUnregistered, id)
      this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged)
    }
    return existed
  }

  list(): AgentManifest {
    const rpcTools = this._collectRpcTools()
    const plainTools = Array.from(this.tools.values()).map(t => t.tool)
    const resources = Array.from(this.resources.values()).map(r => r.resource)

    // Provider tools are queried lazily; earlier sources win on id collision.
    const seen = new Set([...rpcTools, ...plainTools].map(t => t.id))
    const providerTools: AgentTool[] = []
    for (const { tool } of this._collectProviderTools()) {
      if (seen.has(tool.id))
        continue
      seen.add(tool.id)
      providerTools.push(tool)
    }

    return {
      tools: [...rpcTools, ...plainTools, ...providerTools],
      resources,
    }
  }

  getTool(id: string): AgentTool | undefined {
    const plain = this.tools.get(id)
    if (plain)
      return plain.tool
    const rpc = this._collectRpcTools().find(t => t.id === id)
    if (rpc)
      return rpc
    return this._collectProviderTools().find(t => t.tool.id === id)?.tool
  }

  getResource(id: string): AgentResource | undefined {
    return this.resources.get(id)?.resource
  }

  async invoke(id: string, args: unknown): Promise<unknown> {
    const plain = this.tools.get(id)
    if (plain?.handler) {
      return await plain.handler(args)
    }

    const rpcDef = this._findRpcDefinition(id)
    if (rpcDef) {
      // RPC args are positional. Accept an object keyed by `arg0..argN`
      // (what the MCP adapter sends after flattening), or a plain array.
      // An untyped RPC may take a single raw object, so undeclared object
      // payload wraps into one positional argument.
      const positional = coerceAgentPositionalArgs(args, rpcDef.args as readonly unknown[] | undefined, 'wrap')
      return await this.context.rpc.invokeLocal(id as any, ...(positional as any))
    }

    const provided = this._collectProviderTools().find(t => t.tool.id === id)
    if (provided) {
      return await provided.input.handler(args)
    }

    throw new Error(`[devframe/agent] tool "${id}" not found`)
  }

  async read(id: string): Promise<AgentResourceContent> {
    const entry = this.resources.get(id)
    if (!entry)
      throw new Error(`[devframe/agent] resource "${id}" not found`)
    return await entry.read()
  }

  /** @internal */
  _dispose(): void {
    this._rpcUnsubscribe?.()
    this._rpcUnsubscribe = undefined
  }

  private _validateToolId(id: string): void {
    if (this.tools.has(id))
      throw diagnostics.DF0015({ id })
    // Collision with an RPC function that already carries an `agent` field.
    const rpcDef = this.context.rpc.definitions.get(id)
    if (rpcDef?.agent)
      throw diagnostics.DF0015({ id })
  }

  private _projectTool(input: AgentToolInput): AgentTool {
    if (!input.description || typeof input.description !== 'string')
      throw diagnostics.DF0014({ name: input.id })

    return {
      id: input.id,
      kind: 'tool',
      title: input.title ?? input.id,
      description: input.description,
      safety: input.safety ?? 'action',
      tags: input.tags,
      /**
       * Standard Schema `args` are carried raw (mirroring how an RPC-backed
       * tool defers to `ctx.rpc.definitions`) - consumers (the MCP adapter)
       * convert to JSON Schema on demand. An explicit `inputSchema` override
       * wins when given.
       */
      args: input.args,
      inputSchema: input.inputSchema,
      outputSchema: input.outputSchema,
      examples: input.examples,
    }
  }

  /** Query every registered provider, projecting inputs to serializable tools. */
  private _collectProviderTools(): { input: AgentToolInput, tool: AgentTool }[] {
    const out: { input: AgentToolInput, tool: AgentTool }[] = []
    for (const provider of this.providers) {
      for (const input of provider())
        out.push({ input, tool: this._projectTool(input) })
    }
    return out
  }

  private _collectRpcTools(): AgentTool[] {
    const out: AgentTool[] = []
    for (const [name, def] of this.context.rpc.definitions) {
      const agent = def.agent as RpcFunctionAgentOptions | undefined
      if (!agent)
        continue
      if (!agent.description || typeof agent.description !== 'string')
        throw diagnostics.DF0014({ name })

      const type: RpcFunctionType = def.type ?? 'query'
      const safety = agent.safety ?? inferSafety(type)
      out.push({
        id: name,
        kind: 'rpc',
        title: agent.title ?? name,
        description: agent.description,
        safety,
        tags: agent.tags,
        rpcName: name,
        examples: agent.examples,
        // Schemas are carried by the definition itself - consumers
        // (e.g. the MCP adapter) convert the Standard Schema → JSON Schema
        // on demand.
      })
    }
    return out
  }

  private _findRpcDefinition(id: string): RpcFunctionDefinitionAnyWithContext<DevframeNodeContext> | undefined {
    const def = this.context.rpc.definitions.get(id)
    if (def?.agent)
      return def
    return undefined
  }
}

function inferSafety(type: RpcFunctionType): 'read' | 'action' | 'destructive' {
  if (type === 'static' || type === 'query')
    return 'read'
  return 'action'
}
