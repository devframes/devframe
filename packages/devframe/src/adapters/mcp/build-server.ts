import type { Tool } from '@modelcontextprotocol/server'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { RpcFunctionDefinitionAnyWithContext } from 'devframe/rpc'
import type { AgentTool, DevframeDefinition, DevframeHost, DevframeNodeContext } from 'devframe/types'
import { homedir } from 'node:os'
import process from 'node:process'
import { Server } from '@modelcontextprotocol/server'
import { createHostContext } from 'devframe/node'
import { join } from 'pathe'
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

/**
 * Wire an MCP {@link Server} to a devframe context. Returns the server
 * plus a disposal function for the subscriptions it sets up. The
 * transport is the caller's responsibility — `createMcpServer` connects
 * stdio; tests can connect an {@link InMemoryTransport} instead.
 *
 * @internal
 */
export function buildMcpServerFromContext(
  ctx: DevframeNodeContext,
  options: { serverName: string, serverVersion: string, exposeSharedState: boolean | ((k: string) => boolean) },
): { server: Server, dispose: () => void } {
  const server = new Server(
    {
      name: options.serverName,
      version: options.serverVersion,
    },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true },
      },
    },
  )

  registerToolHandlers(server, ctx)
  registerResourceHandlers(server, ctx, options.exposeSharedState)

  const notify = (method: string): void => {
    server.notification({ method }).catch(() => { /* ignore transport errors */ })
  }
  const offManifest = ctx.agent.events.on('agent:manifest:changed', () => {
    notify('notifications/tools/list_changed')
    notify('notifications/resources/list_changed')
  })
  const offKeyAdded = ctx.rpc.sharedState.onKeyAdded(() => {
    notify('notifications/resources/list_changed')
  })

  return {
    server,
    dispose: () => {
      offManifest()
      offKeyAdded()
    },
  }
}

/**
 * Build an MCP server over the agent surface of a devframe definition.
 * Currently supports `stdio` transport only.
 *
 * @experimental The agent-native surface is experimental and may change
 * without a major version bump until it stabilizes.
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
  })
  await definition.setup(ctx)

  const { server, dispose } = buildMcpServerFromContext(ctx, {
    serverName: options.serverName ?? `${definition.id} (devframe)`,
    serverVersion: options.serverVersion ?? definition.version ?? '0.0.0',
    exposeSharedState: options.exposeSharedState ?? true,
  })

  const { startStdioTransport } = await import('./transports')
  let stop: () => Promise<void>
  try {
    stop = await startStdioTransport(server)
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw diagnostics.DF0017({ transport, reason, cause: error })
  }

  options.onReady?.({ transport: 'stdio' })

  return {
    async stop() {
      dispose()
      await stop()
    },
  }
}

function registerToolHandlers(server: Server, ctx: DevframeNodeContext): void {
  server.setRequestHandler('tools/list', async () => {
    const tools = await Promise.all(ctx.agent.list().tools.map(tool => projectTool(tool, ctx)))
    return { tools }
  })

  server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params
    try {
      const tool = ctx.agent.getTool(name)
      const outputSchema = tool
        ? tool.outputSchema ?? await computeOutputSchema(tool, ctx)
        : undefined
      const result = await ctx.agent.invoke(name, args ?? {})
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
  server.setRequestHandler('resources/list', async () => {
    const resources = ctx.agent.list().resources.map(resource => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType,
    }))

    if (exposeSharedState !== false) {
      const filter = typeof exposeSharedState === 'function' ? exposeSharedState : () => true
      for (const key of ctx.rpc.sharedState.keys()) {
        if (!filter(key))
          continue
        resources.push({
          uri: `devframe://state/${encodeURIComponent(key)}`,
          name: key,
          description: `Shared state: ${key}`,
          mimeType: 'application/json',
        })
      }
    }

    return { resources }
  })

  server.setRequestHandler('resources/read', async (request) => {
    const { uri } = request.params
    const parsed = parseResourceUri(uri)

    if (parsed.kind === 'resource') {
      const content = await ctx.agent.read(parsed.id)
      return {
        contents: [
          {
            uri,
            mimeType: content.mimeType ?? 'application/json',
            text: content.text ?? stringifyForMcp(content.json),
          },
        ],
      }
    }

    if (parsed.kind === 'state') {
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

async function projectTool(tool: AgentTool, ctx: DevframeNodeContext): Promise<Tool> {
  const inputSchema = tool.inputSchema ?? await computeInputSchema(tool, ctx)
  const outputSchema = tool.outputSchema ?? await computeOutputSchema(tool, ctx)
  return {
    name: tool.id,
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

async function computeInputSchema(tool: AgentTool, ctx: DevframeNodeContext): Promise<unknown> {
  if (tool.kind !== 'rpc' || !tool.rpcName)
    return { type: 'object', properties: {} }
  const def = ctx.rpc.definitions.get(tool.rpcName) as RpcFunctionDefinitionAnyWithContext<DevframeNodeContext> | undefined
  if (!def)
    return { type: 'object', properties: {} }
  const args = def.args as readonly StandardSchemaV1[] | undefined
  return (await argsToJsonSchema(args)).schema
}

async function computeOutputSchema(tool: AgentTool, ctx: DevframeNodeContext): Promise<unknown> {
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
  const decoded = decodeURIComponent(rest!)
  if (kind === 'resource')
    return { kind: 'resource', id: decoded }
  return { kind: 'state', key: decoded }
}
