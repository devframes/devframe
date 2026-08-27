import type { McpRequestContext, ServerCapabilities, Tool } from '@modelcontextprotocol/server'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { RpcFunctionDefinitionAnyWithContext } from 'devframe/rpc'
import type { AgentTool, DevframeDefinition, DevframeHost, DevframeNodeContext } from 'devframe/types'
import { homedir } from 'node:os'
import process from 'node:process'
import { Server, UriTemplate } from '@modelcontextprotocol/server'
import { createHostContext } from 'devframe/node'
import { toAgentToolName } from 'devframe/utils/agent-tool-name'
import { join } from 'pathe'
import { DEVFRAME_EVENTS } from '../../events'
import { diagnostics } from '../../node/diagnostics'
import { formatMcpError, stringifyForMcp } from './stringify'
import { argsToJsonSchema, returnToJsonSchema } from './to-json-schema'

export interface CreateMcpServerOptions {
  /**
   * Transport to use. `createMcpServer` itself runs `'stdio'` (a standalone
   * process with its own host context); the Streamable-HTTP transport is
   * served route-based by the dev server instead — see `mountMcpHttp` and
   * the `mcp` option on `createDevServer` / `createCac`'s `--mcp` flag.
   */
  transport?: 'stdio'
  /**
   * Expose shared-state keys as MCP resources.
   * - `true` (default) — every key the host publishes
   * - `false` — none
   * - `(key) => boolean` — filter
   */
  exposeSharedState?: boolean | ((key: string) => boolean)
  /** Override the name reported in the MCP handshake. */
  serverName?: string
  /** Override the version reported in the MCP handshake. Defaults to `definition.version ?? '0.0.0'`. */
  serverVersion?: string
  /** Called once the transport is connected. */
  onReady?: (info: { transport: 'stdio' }) => void
}

export interface McpServerHandle {
  stop: () => Promise<void>
}

export interface BuildMcpServerOptions {
  serverName: string
  serverVersion: string
  exposeSharedState: boolean | ((key: string) => boolean)
}

type ResourceCapabilities = NonNullable<ServerCapabilities['resources']>

/** @internal */
export function mcpResourceCapabilitiesFor(requestContext: McpRequestContext): ResourceCapabilities {
  return requestContext.era === 'modern'
    ? { listChanged: true, subscribe: true }
    : { listChanged: true }
}

/**
 * Build a fresh MCP {@link Server} over a devframe context, registering its
 * tool and resource handlers. This is a pure factory — it sets up no
 * long-lived subscriptions and holds no per-connection state, so it is safe
 * to call once per request under `createMcpHandler` or once per connection
 * under `serveStdio`. Change notifications are published separately: over
 * HTTP through the handler's `notify` bus (see `createMcpFetchHandler`), and
 * on stdio through the connection's own `send*ListChanged` and
 * `sendResourceUpdated` calls (see {@link bridgeMcpUpdates}).
 *
 * @internal
 */
export function buildMcpServerFromContext(
  ctx: DevframeNodeContext,
  options: BuildMcpServerOptions,
  resourceCapabilities: ResourceCapabilities,
): Server {
  const server = new Server(
    {
      name: options.serverName,
      version: options.serverVersion,
    },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: resourceCapabilities,
      },
    },
  )

  registerToolHandlers(server, ctx, options.exposeSharedState)
  registerResourceHandlers(server, ctx, options.exposeSharedState)

  return server
}

/**
 * Publish devframe's list-change and resource-content events through typed
 * sinks: `toolsChanged()` and `resourcesChanged()` for catalog changes, and
 * `resourceUpdated(uri)` for content invalidations. Shared-state keys are
 * projected as resources and filtered through `exposeSharedState`. Returns an
 * unsubscribe function that disposes every bridge listener.
 *
 * The HTTP path passes the handler's `notify` bus. The stdio path passes the
 * pinned server's `send*ListChanged` and `sendResourceUpdated` methods, which
 * `serveStdio` routes onto the connection's active MCP 2026
 * `subscriptions/listen` streams.
 *
 * @internal
 */
export function bridgeMcpUpdates(
  ctx: DevframeNodeContext,
  exposeSharedState: boolean | ((key: string) => boolean),
  sinks: {
    toolsChanged: () => void
    resourcesChanged: () => void
    resourceUpdated: (uri: string) => void
  },
): () => void {
  const stateFilter = sharedStateFilter(exposeSharedState)
  const offManifest = ctx.agent.events.on(DEVFRAME_EVENTS.bus.agentManifestChanged, () => {
    sinks.toolsChanged()
    sinks.resourcesChanged()
  })
  const offResourceUpdated = ctx.agent.events.on(DEVFRAME_EVENTS.bus.agentResourceUpdated, sinks.resourceUpdated)
  const offKeyAdded = ctx.rpc.sharedState.onKeyAdded((key) => {
    if (stateFilter?.(key))
      sinks.resourcesChanged()
  })
  const offKeyRemoved = ctx.rpc.sharedState.onKeyRemoved((key) => {
    if (stateFilter?.(key))
      sinks.resourcesChanged()
  })
  const offStateUpdated = ctx.rpc.sharedState.onUpdated((key) => {
    if (stateFilter?.(key))
      sinks.resourceUpdated(sharedStateResourceUri(key))
  })

  return () => {
    offManifest()
    offResourceUpdated()
    offKeyAdded()
    offKeyRemoved()
    offStateUpdated()
  }
}

/**
 * Build an MCP server over the agent surface of a devframe definition.
 * Currently supports `stdio` transport only.
 */
export async function createMcpServer(
  definition: DevframeDefinition,
  options: CreateMcpServerOptions = {},
): Promise<McpServerHandle> {
  const transport = options.transport ?? 'stdio'
  if (transport !== 'stdio')
    throw diagnostics.DF0017({ transport, reason: 'Only stdio transport is supported in this release.' })

  const host: DevframeHost = {
    mountStatic: () => { /* MCP has no static surface */ },
    resolveOrigin: () => 'mcp://devframe',
    getStorageDir: (scope) => {
      if (scope === 'workspace')
        return join(process.cwd(), '.devframe')
      if (scope === 'project')
        return join(process.cwd(), `node_modules/.${definition.id}/devframe`)
      return join(homedir(), `.${definition.id}/devframe`)
    },
  }

  const ctx = await createHostContext({
    cwd: process.cwd(),
    mode: 'dev',
    host,
    importMetaUrl: definition.importMetaUrl,
  })
  // Services ready before setup, so setup can consume them synchronously.
  for (const input of definition.services ?? [])
    void ctx.services.install(input, { resolveFrom: definition.importMetaUrl })
  await ctx.services.ready()
  await definition.setup(ctx)

  const buildOptions: BuildMcpServerOptions = {
    serverName: options.serverName ?? `${definition.id} (devframe)`,
    serverVersion: options.serverVersion ?? definition.version ?? '0.0.0',
    exposeSharedState: options.exposeSharedState ?? true,
  }

  // `serveStdio` owns protocol negotiation and pins one instance for the
  // connection lifetime. Each pinned server bridges list changes through its
  // `send*ListChanged` methods. MCP 2026 also routes resource invalidations
  // through `subscriptions/listen`; MCP 2025 pulls resource contents. The
  // bridge is removed when the pinned server closes.
  let handle: import('@modelcontextprotocol/server/stdio').StdioServerHandle
  try {
    const { serveStdio } = await import('@modelcontextprotocol/server/stdio')
    handle = serveStdio((requestContext) => {
      const resourceCapabilities = mcpResourceCapabilitiesFor(requestContext)
      const server = buildMcpServerFromContext(ctx, buildOptions, resourceCapabilities)
      const resourceUpdated = resourceCapabilities.subscribe
        ? (uri: string): void => { void server.sendResourceUpdated({ uri }).catch(() => {}) }
        : (): void => {}
      const unbridge = bridgeMcpUpdates(ctx, buildOptions.exposeSharedState, {
        toolsChanged: () => { void server.sendToolListChanged().catch(() => {}) },
        resourcesChanged: () => { void server.sendResourceListChanged().catch(() => {}) },
        resourceUpdated,
      })
      const priorOnClose = server.onclose
      server.onclose = () => {
        unbridge()
        priorOnClose?.()
      }
      return server
    })
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw diagnostics.DF0017({ transport, reason, cause: error })
  }

  options.onReady?.({ transport: 'stdio' })

  return {
    async stop() {
      await handle.close()
    },
  }
}

/**
 * Id of the built-in shared-state read tool — namespaced like every other
 * built-in (`devframe:<area>:<fn>`). Tool-shaped access matters because many
 * MCP clients only consume tools — the parallel `devframe://state/<key>`
 * resource projection stays for the clients that do read resources.
 */
const READ_STATE_TOOL = 'devframe:state:read'
/** Wire name of the built-in shared-state read tool: `devframe_state_read`. */
const READ_STATE_NAME = toAgentToolName(READ_STATE_TOOL)

function sharedStateFilter(exposeSharedState: boolean | ((key: string) => boolean)): ((key: string) => boolean) | undefined {
  if (exposeSharedState === false)
    return undefined
  return typeof exposeSharedState === 'function' ? exposeSharedState : () => true
}

function sharedStateResourceUri(key: string): string {
  return `devframe://state/${encodeURIComponent(key)}`
}

function readStateToolProjection(): Tool {
  return {
    name: READ_STATE_NAME,
    title: 'Read shared state',
    description: 'Read this devtool\'s live shared state. Call without arguments to list the available keys, then with a key to get that value as JSON. Safe to call freely.',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'A shared-state key from the key list. Omit to list all keys.',
        },
      },
    },
    annotations: {
      title: 'Read shared state',
      readOnlyHint: true,
      destructiveHint: false,
    },
  } as Tool
}

async function readStateResult(
  ctx: DevframeNodeContext,
  filter: (key: string) => boolean,
  key: string | undefined,
): Promise<unknown> {
  const keys = ctx.rpc.sharedState.keys().filter(filter)
  if (key === undefined)
    return { keys }
  if (!keys.includes(key))
    throw diagnostics.DF0048({ key })
  const state = await ctx.rpc.sharedState.get(key)
  return { key, value: state.value() }
}

function registerToolHandlers(
  server: Server,
  ctx: DevframeNodeContext,
  exposeSharedState: boolean | ((key: string) => boolean),
): void {
  const stateFilter = sharedStateFilter(exposeSharedState)
  const warnedCollisions = new Set<string>()

  /**
   * Resolve a wire tool name back to the registered {@link AgentTool}.
   * Wire-name matching runs first, in manifest order — the same tool the
   * list projection advertises under that name — with a raw-id fallback so
   * a colon-namespaced id keeps working as a call name.
   */
  const resolveTool = (name: string): AgentTool | undefined => {
    const byWireName = ctx.agent.list().tools.find(tool => toAgentToolName(tool.id) === name)
    return byWireName ?? ctx.agent.getTool(name)
  }

  server.setRequestHandler('tools/list', async () => {
    // Two ids may sanitize to the same wire name — first registration wins
    // and later ones are hidden with a coded warning (once per name).
    const byName = new Map<string, AgentTool>()
    for (const tool of ctx.agent.list().tools) {
      const name = toAgentToolName(tool.id)
      const existing = byName.get(name)
      if (existing) {
        if (!warnedCollisions.has(`${name}|${tool.id}`)) {
          warnedCollisions.add(`${name}|${tool.id}`)
          diagnostics.DF0047({ name, id: tool.id, existing: existing.id })
        }
        continue
      }
      byName.set(name, tool)
    }
    const tools = [...byName.entries()].map(([name, tool]) => projectTool(name, tool, ctx))
    // A registered agent tool projecting to the same wire name wins over
    // the built-in.
    if (stateFilter && !byName.has(READ_STATE_NAME))
      tools.push(readStateToolProjection())
    return { tools }
  })

  server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params
    try {
      const tool = resolveTool(name)
      // Built-in shared-state read. A registered agent tool resolving to
      // the same wire name wins (mirroring the list projection above) —
      // ids are namespaced, so a collision is a deliberate override.
      if (stateFilter && !tool && (name === READ_STATE_NAME || name === READ_STATE_TOOL)) {
        const key = (args as { key?: string } | undefined)?.key
        const result = await readStateResult(ctx, stateFilter, key)
        return {
          content: [{ type: 'text', text: stringifyForMcp(result) }],
          structuredContent: result as Record<string, unknown>,
        }
      }
      const outputSchema = tool
        ? usableOutputSchema(tool.outputSchema ?? computeOutputSchema(tool, ctx))
        : undefined
      const result = await ctx.agent.invoke(tool?.id ?? name, args ?? {})
      return {
        content: [
          {
            type: 'text',
            text: stringifyForMcp(result),
          },
        ],
        ...(outputSchema ? { structuredContent: result as Record<string, unknown> } : {}),
      }
    }
    catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error invoking "${name}": ${formatMcpError(error)}`,
          },
        ],
      }
    }
  })
}

function registerResourceHandlers(
  server: Server,
  ctx: DevframeNodeContext,
  exposeSharedState: boolean | ((key: string) => boolean),
): void {
  const stateFilter = sharedStateFilter(exposeSharedState)

  server.setRequestHandler('resources/list', async () => {
    const resources = ctx.agent.list().resources.map(resource => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType,
    }))

    if (stateFilter) {
      for (const key of ctx.rpc.sharedState.keys()) {
        if (!stateFilter(key))
          continue
        resources.push({
          uri: sharedStateResourceUri(key),
          name: key,
          description: `Shared state: ${key}`,
          mimeType: 'application/json',
        })
      }
    }

    return { resources }
  })

  server.setRequestHandler('resources/templates/list', async () => {
    const resourceTemplates = ctx.agent.list().resourceTemplates.map(template => ({
      uriTemplate: template.uriTemplate,
      name: template.name,
      description: template.description,
      mimeType: template.mimeType,
    }))

    return { resourceTemplates }
  })

  server.setRequestHandler('resources/read', async (request) => {
    const { uri } = request.params
    const manifest = ctx.agent.list()
    const resource = manifest.resources.find(candidate => candidate.uri === uri)

    if (resource) {
      const content = await ctx.agent.read(resource.id)
      return {
        contents: [
          {
            uri,
            mimeType: content.mimeType ?? resource.mimeType ?? 'application/json',
            text: content.text ?? stringifyForMcp(content.json),
          },
        ],
      }
    }

    for (const template of manifest.resourceTemplates) {
      const variables = new UriTemplate(template.uriTemplate).match(uri)
      if (!variables)
        continue
      const content = await ctx.agent.read(template.id, uri, variables)
      return {
        contents: [
          {
            uri,
            mimeType: content.mimeType ?? template.mimeType ?? 'application/json',
            text: content.text ?? stringifyForMcp(content.json),
          },
        ],
      }
    }

    const parsed = parseResourceUri(uri)
    if (parsed.kind === 'state' && stateFilter?.(parsed.key) && ctx.rpc.sharedState.keys().includes(parsed.key)) {
      const state = await ctx.rpc.sharedState.get(parsed.key)
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: stringifyForMcp(state.value()),
          },
        ],
      }
    }

    throw new Error(`[devframe/mcp] unknown resource URI "${uri}"`)
  })
}

/**
 * MCP constrains a tool's `outputSchema` to a JSON Schema of `type:
 * "object"` — clients (the SDK included) reject anything else. Non-object
 * return schemas (e.g. a schema for `void` / a bare string) simply project
 * no output schema; the text content still carries the result.
 */
function usableOutputSchema(schema: unknown): unknown {
  return schema && typeof schema === 'object' && (schema as { type?: unknown }).type === 'object'
    ? schema
    : undefined
}

function projectTool(name: string, tool: AgentTool, ctx: DevframeNodeContext): Tool {
  const inputSchema = tool.inputSchema ?? computeInputSchema(tool, ctx)
  const outputSchema = usableOutputSchema(tool.outputSchema ?? computeOutputSchema(tool, ctx))
  return {
    name,
    title: tool.title,
    description: tool.description,
    inputSchema,
    ...(outputSchema ? { outputSchema } : {}),
    annotations: {
      title: tool.title,
      readOnlyHint: tool.safety === 'read',
      destructiveHint: tool.safety === 'destructive',
    },
  } as Tool
}

function computeInputSchema(tool: AgentTool, ctx: DevframeNodeContext): unknown {
  if (tool.kind === 'tool')
    return argsToJsonSchema(tool.args).schema
  if (tool.kind !== 'rpc' || !tool.rpcName)
    return { type: 'object', properties: {} }
  const def = ctx.rpc.definitions.get(tool.rpcName) as RpcFunctionDefinitionAnyWithContext<DevframeNodeContext> | undefined
  if (!def)
    return { type: 'object', properties: {} }
  const args = def.args as readonly StandardSchemaV1[] | undefined
  return argsToJsonSchema(args).schema
}

function computeOutputSchema(tool: AgentTool, ctx: DevframeNodeContext): unknown {
  if (tool.kind !== 'rpc' || !tool.rpcName)
    return undefined
  const def = ctx.rpc.definitions.get(tool.rpcName) as RpcFunctionDefinitionAnyWithContext<DevframeNodeContext> | undefined
  if (!def)
    return undefined
  return returnToJsonSchema(def.returns as StandardSchemaV1 | undefined)
}

function parseResourceUri(uri: string): { kind: 'resource', id: string } | { kind: 'state', key: string } | { kind: 'unknown' } {
  const match = uri.match(/^devframe:\/\/(resource|state)\/(.+)$/)
  if (!match)
    return { kind: 'unknown' }
  const [, kind, rest] = match
  let decoded: string
  try {
    decoded = decodeURIComponent(rest!)
  }
  catch {
    return { kind: 'unknown' }
  }
  if (kind === 'resource')
    return { kind: 'resource', id: decoded }
  return { kind: 'state', key: decoded }
}
