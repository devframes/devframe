import type { Tool } from '@modelcontextprotocol/server'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { RpcFunctionDefinitionAnyWithContext } from 'devframe/rpc'
import type { AgentTool, CreateMcpServerOptions, DevframeDefinition, DevframeHost, DevframeNodeContext, McpContentBlock, McpResourcesChangedHook, McpResourceTemplate, McpServerHandle } from 'devframe/types'
import { homedir } from 'node:os'
import process from 'node:process'
import { Server } from '@modelcontextprotocol/server'
import { DEVFRAME_EVENTS } from 'devframe/constants'
import { argsToJsonSchema, diagnostics, formatMcpError, getMcpContent, returnToJsonSchema, stringifyForMcp } from 'devframe/internal'
import { createHostContext } from 'devframe/node'
import { toAgentToolName } from 'devframe/utils/agent-tool-name'
import { join } from 'pathe'

export interface BuildMcpServerOptions {
  serverName: string
  serverVersion: string
  exposeSharedState: boolean | ((k: string) => boolean)
  /** Sent as `instructions` in the `initialize` / `server/discover` result. */
  instructions?: string
  /**
   * Compiled resource templates (see {@link compileResourceTemplates});
   * omitted or empty keeps the resource handlers unchanged.
   */
  resourceTemplates?: CompiledResourceTemplate[]
}

/**
 * A {@link McpResourceTemplate} with its `uriTemplate` compiled to a matcher.
 *
 * @internal
 */
export interface CompiledResourceTemplate {
  template: McpResourceTemplate
  /** The decoded value of each `{name}` when `uri` matches, else `undefined`. */
  match: (uri: string) => Record<string, string> | undefined
}

/**
 * Build a fresh MCP {@link Server} over a devframe context, registering its
 * tool and resource handlers. This is a pure factory: it sets up no
 * long-lived subscriptions and holds no per-connection state, so it is safe
 * to call once per request under `createMcpHandler` or once per connection
 * under `serveStdio`. Change notifications are published separately: over
 * HTTP through the handler's `notify` bus (see `createMcpFetchHandler`), and
 * on stdio through the connection's own `send*ListChanged` calls (see
 * {@link bridgeListChanged}, wired by `serveStdio`).
 *
 * @internal
 */
export function buildMcpServerFromContext(
  ctx: DevframeNodeContext,
  options: BuildMcpServerOptions,
): Server {
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
      ...(options.instructions ? { instructions: options.instructions } : {}),
    },
  )

  registerToolHandlers(server, ctx, options.exposeSharedState)
  const templates = options.resourceTemplates ?? []
  registerResourceHandlers(server, ctx, options.exposeSharedState, templates)
  if (templates.length)
    registerResourceTemplateHandlers(server, templates)

  return server
}

/**
 * Publish devframe's `list_changed` events through a set of typed sinks:
 * `tools()` for tool-list changes and `resources()` for resource-list
 * changes (shared-state keys are surfaced as resources). An optional host
 * subscription (`onResourcesChanged`) also publishes through `resources()`
 * each time it calls `notify()`. Returns an unsubscribe function, which also
 * removes the host subscription; a `notify()` after that does nothing.
 *
 * The HTTP path passes the handler's `notify` bus sugar; the stdio path
 * passes the pinned server's `send*ListChanged` methods, which `serveStdio`
 * routes onto the connection's active `subscriptions/listen` streams.
 *
 * @internal
 */
export function bridgeListChanged(
  ctx: DevframeNodeContext,
  sinks: { tools: () => void, resources: () => void },
  onResourcesChanged?: McpResourcesChangedHook,
): () => void {
  const offManifest = ctx.agent.events.on(DEVFRAME_EVENTS.bus.agentManifestChanged, () => {
    sinks.tools()
    sinks.resources()
  })
  const offKeyAdded = ctx.rpc.sharedState.onKeyAdded(() => {
    sinks.resources()
  })
  let active = true
  const offHost = onResourcesChanged?.(() => {
    if (active)
      sinks.resources()
  }, ctx)
  return () => {
    active = false
    offManifest()
    offKeyAdded()
    offHost?.()
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
  // Compile before setup, so an invalid template fails fast (DF0084).
  const resourceTemplates = compileResourceTemplates(options.resourceTemplates)

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
    instructions: options.instructions,
    resourceTemplates,
  }

  // `serveStdio` pins ONE instance for the connection's lifetime. Each pinned
  // server sets up its own `list_changed` bridge over the connection's
  // `send*ListChanged` calls (routed onto active `subscriptions/listen`
  // streams on a modern connection, sent unsolicited on a 2025-era one) and
  // tears it down when that server closes.
  let handle: import('@modelcontextprotocol/server/stdio').StdioServerHandle
  try {
    const { serveStdio } = await import('@modelcontextprotocol/server/stdio')
    handle = serveStdio(() => {
      const server = buildMcpServerFromContext(ctx, buildOptions)
      const unbridge = bridgeListChanged(ctx, {
        tools: () => { void server.sendToolListChanged().catch(() => {}) },
        resources: () => { void server.sendResourceListChanged().catch(() => {}) },
      }, options.onResourcesChanged)
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
 * Id of the built-in shared-state read tool, namespaced like every other
 * built-in (`devframe:<area>:<fn>`). Tool-shaped access matters because many
 * MCP clients only consume tools; the parallel `devframe://state/<key>`
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
   * Wire-name matching runs first, in manifest order (the same tool the
   * list projection advertises under that name), with a raw-id fallback so
   * a colon-namespaced id keeps working as a call name.
   */
  const resolveTool = (name: string): AgentTool | undefined => {
    const byWireName = ctx.agent.list().tools.find(tool => toAgentToolName(tool.id) === name)
    return byWireName ?? ctx.agent.getTool(name)
  }

  server.setRequestHandler('tools/list', async () => {
    // Two ids may sanitize to the same wire name; first registration wins
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
      // the same wire name wins (mirroring the list projection above);
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
      // Blocks attached with `withMcpContent` replace the default JSON text
      // block. `structuredContent` stays the plain result either way, so a
      // tool with an output schema still matches it.
      const content = mcpContentOf(name, result) ?? [{ type: 'text', text: stringifyForMcp(result) }]
      return {
        content,
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
  templates: CompiledResourceTemplate[],
): void {
  const stateFilter = sharedStateFilter(exposeSharedState)

  server.setRequestHandler('resources/list', async () => {
    const resources: ResourceListing[] = ctx.agent.list().resources.map(resource => ({
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
          uri: `devframe://state/${encodeURIComponent(key)}`,
          name: key,
          description: `Shared state: ${key}`,
          mimeType: 'application/json',
        })
      }
    }

    for (const { template } of templates) {
      for (const entry of await template.list?.(ctx) ?? [])
        resources.push({ ...entry, mimeType: entry.mimeType ?? template.mimeType })
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
      // Apply the exposure policy at the read, not only during discovery:
      // a caller that knows a filtered key must not bypass it. Deny with the
      // same DF0048 the built-in read tool uses, so a denied key is
      // indistinguishable from a missing one.
      if (!stateFilter || !stateFilter(parsed.key))
        throw diagnostics.DF0048({ key: parsed.key })
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

    // Templates come after the registered and shared-state resources (whose
    // `devframe://` URIs return or throw above); the first one that matches
    // reads the URI. A throwing `read` is reported
    // like a throwing registered resource: the error goes to the MCP client.
    for (const { template, match } of templates) {
      const params = match(uri)
      if (!params)
        continue
      const content = await template.read(params, uri, ctx)
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

    throw new Error(`[devframe/mcp] unknown resource URI "${uri}"`)
  })
}

/** One entry of the `resources/list` result. */
interface ResourceListing {
  uri: string
  name: string
  title?: string
  description?: string
  mimeType?: string
}

/** Serve `resources/templates/list`: one entry per template, in the given order. */
function registerResourceTemplateHandlers(server: Server, templates: CompiledResourceTemplate[]): void {
  server.setRequestHandler('resources/templates/list', async () => ({
    resourceTemplates: templates.map(({ template: { uriTemplate, name, title, description, mimeType } }) => ({ uriTemplate, name, title, description, mimeType })),
  }))
}

/** One `{name}` expression of a URI template. */
const TEMPLATE_EXPRESSION_RE = /\{([^{}]*)\}/g
/** RFC 6570 `varname`: letters, digits and `_`, with single dots between them. */
const TEMPLATE_VARNAME_RE = /^\w+(?:\.\w+)*$/

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Compile resource templates to URI matchers, once per endpoint. Only RFC
 * 6570 level 1 is supported: plain `{name}` expressions. Each expression
 * matches one non-empty URI segment (no `/`), and its value is
 * percent-decoded, so an encoded `%2F` reads back as `/`. A URI with
 * malformed percent-encoding matches no template. Any other template syntax
 * throws `DF0084`.
 *
 * @internal
 */
export function compileResourceTemplates(templates: McpResourceTemplate[] = []): CompiledResourceTemplate[] {
  return templates.map(compileResourceTemplate)
}

function compileResourceTemplate(template: McpResourceTemplate): CompiledResourceTemplate {
  const { name, uriTemplate } = template
  const invalid = (reason: string) => diagnostics.DF0084({ name, uriTemplate, reason })
  const names: string[] = []
  let source = '^'
  let last = 0
  for (const expression of uriTemplate.matchAll(TEMPLATE_EXPRESSION_RE)) {
    const literal = uriTemplate.slice(last, expression.index)
    if (/[{}]/.test(literal))
      throw invalid('a `{` or `}` is outside an expression.')
    const varname = expression[1]!
    if (!TEMPLATE_VARNAME_RE.test(varname))
      throw invalid(`the expression "{${varname}}" is not a plain \`{name}\`.`)
    if (names.includes(varname))
      throw invalid(`the name "${varname}" is used more than once.`)
    names.push(varname)
    source += `${escapeRegExp(literal)}([^/]+)`
    last = expression.index + expression[0].length
  }
  const tail = uriTemplate.slice(last)
  if (/[{}]/.test(tail))
    throw invalid('a `{` or `}` is outside an expression.')
  const pattern = new RegExp(`${source}${escapeRegExp(tail)}$`)

  return {
    template,
    match(uri) {
      const found = pattern.exec(uri)
      if (!found)
        return undefined
      const params: Record<string, string> = {}
      try {
        names.forEach((varname, index) => {
          params[varname] = decodeURIComponent(found[index + 1]!)
        })
      }
      catch {
        return undefined
      }
      return params
    },
  }
}

/**
 * The content blocks a tool result carries through `withMcpContent`, checked
 * and copied field by field, or `undefined` when it carries none. Invalid
 * blocks throw DF0081, which the `tools/call` handler turns into an
 * `isError` result.
 */
function mcpContentOf(name: string, result: unknown): McpContentBlock[] | undefined {
  const blocks = getMcpContent(result)
  if (blocks === undefined)
    return undefined
  if (!Array.isArray(blocks) || blocks.length === 0)
    throw diagnostics.DF0081({ name, reason: 'expected a non-empty array' })
  // `Array.from` visits the holes of a sparse array as `undefined`, so they fail the check below.
  return Array.from(blocks, (block: unknown, index): McpContentBlock => {
    const b = (block ?? {}) as Record<string, unknown>
    if (b.type === 'text' && typeof b.text === 'string')
      return { type: 'text', text: b.text }
    if ((b.type === 'image' || b.type === 'audio') && typeof b.data === 'string' && typeof b.mimeType === 'string')
      return { type: b.type, data: b.data, mimeType: b.mimeType }
    throw diagnostics.DF0081({ name, reason: `block ${index} is not a valid text, image or audio block` })
  })
}

/**
 * MCP constrains a tool's `outputSchema` to a JSON Schema of `type:
 * "object"`; clients (the SDK included) reject anything else. Non-object
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
    return argsToJsonSchema(tool.args)
  if (tool.kind !== 'rpc' || !tool.rpcName)
    return { type: 'object', properties: {} }
  const def = ctx.rpc.definitions.get(tool.rpcName) as RpcFunctionDefinitionAnyWithContext<DevframeNodeContext> | undefined
  if (!def)
    return { type: 'object', properties: {} }
  const args = def.args as readonly StandardSchemaV1[] | undefined
  return argsToJsonSchema(args)
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
  const decoded = decodeURIComponent(rest!)
  if (kind === 'resource')
    return { kind: 'resource', id: decoded }
  return { kind: 'state', key: decoded }
}
