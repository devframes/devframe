import type { DevframeInstanceRecord } from '../node/instance-registry'
import process from 'node:process'
import { joinURL } from 'ufo'
import { diagnostics } from '../node/diagnostics'
import { listLiveDevframeInstances } from '../node/instance-registry'

export interface ConnectServerOptions {
  /**
   * Explicit ports to probe besides the registry — for instances started
   * before the registry existed, or reachable only by convention. Each port
   * is probed at `/` (`http://localhost:<port>/__connection.json`).
   */
  ports?: number[]
  /** Override the registry directory (`DEVFRAME_INSTANCES_DIR` also applies). */
  instancesDir?: string
  /** Probe timeout per instance, ms. Default 1000. */
  timeoutMs?: number
}

export interface ConnectServerHandle {
  stop: () => Promise<void>
}

interface IndexedInstance {
  id: string
  name?: string
  pid: number
  port: number
  origin: string
  basePath: string
  rootDir: string
  startedAt: number
  mcp: {
    url: string
    tools?: { name: string, description?: string }[]
    error?: string
  } | null
  hint?: string
}

const INDEX_TOOL = 'devframe:connect:list-instances'
const CALL_TOOL = 'devframe:connect:call-tool'

const MCP_DISABLED_HINT
  = 'This instance runs without an MCP route. Restart it with the --mcp flag (or set `cli.mcp: true` on its definition) to expose its tools, then list instances again.'

/**
 * Start the devframe MCP connector on stdio: a thin discovery + proxy server
 * in the shape next-devtools-mcp validated. It exposes two gateway tools —
 * `devframe:connect:list-instances` (discover running devframe instances via
 * the instance registry and list each one's MCP tools) and
 * `devframe:connect:call-tool` (invoke one tool on one instance over its
 * Streamable-HTTP endpoint) — and holds no domain knowledge of its own.
 *
 * @experimental
 */
export async function startConnectServer(options: ConnectServerOptions = {}): Promise<ConnectServerHandle> {
  const sdk = await importSdk()

  const server = new sdk.Server(
    { name: 'devframe-connect', version: '0.0.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler('tools/list', async () => ({
    tools: [
      {
        name: INDEX_TOOL,
        title: 'Discover running devframes',
        description: 'Discover every running devframe dev server on this machine and list each one\'s MCP tools. Call this FIRST, before assuming which devtools are available — the result names the instance (id, project root, origin) and the port to pass to the call tool. Safe to call freely.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      {
        name: CALL_TOOL,
        title: 'Call a devframe tool',
        description: 'Invoke one MCP tool on one running devframe instance discovered via the list-instances tool. Pass the instance\'s port, the tool name, and the tool\'s arguments object.',
        inputSchema: {
          type: 'object',
          properties: {
            port: { type: 'number', description: 'The instance\'s port, from the list-instances tool.' },
            tool: { type: 'string', description: 'Tool name, from the instance\'s tool list.' },
            args: { type: 'object', description: 'Arguments object for the tool. Omit for zero-argument tools.' },
          },
          required: ['port', 'tool'],
          additionalProperties: false,
        },
      },
    ],
  }))

  server.setRequestHandler('tools/call', async (request: any) => {
    const { name, arguments: args } = request.params
    try {
      if (name === INDEX_TOOL)
        return textResult(await index(sdk, options))
      if (name === CALL_TOOL)
        return textResult(await call(sdk, options, args ?? {}))
      return errorResult({ message: `unknown tool "${name}"`, fix: `Call ${INDEX_TOOL} or ${CALL_TOOL}.` })
    }
    catch (error) {
      return errorResult({
        message: error instanceof Error ? error.message : String(error),
        ...(error && typeof error === 'object' && 'fix' in error && typeof error.fix === 'string' ? { fix: error.fix } : {}),
      })
    }
  })

  const transport = new sdk.StdioServerTransport()
  await server.connect(transport)

  return {
    stop: async () => {
      await server.close()
    },
  }
}

async function importSdk(): Promise<any> {
  try {
    const [serverMod, stdioMod, clientMod] = await Promise.all([
      import('@modelcontextprotocol/server'),
      import('@modelcontextprotocol/server/stdio'),
      import('@modelcontextprotocol/client'),
    ])
    return {
      Server: serverMod.Server,
      StdioServerTransport: stdioMod.StdioServerTransport,
      Client: clientMod.Client,
      StreamableHTTPClientTransport: clientMod.StreamableHTTPClientTransport,
    }
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw diagnostics.DF0046({ reason, cause: error })
  }
}

/** Discover instances: registry (prune-on-read) + explicit port probes. */
async function index(sdk: any, options: ConnectServerOptions): Promise<unknown> {
  const { live } = await listLiveDevframeInstances({
    instancesDir: options.instancesDir,
    timeoutMs: options.timeoutMs,
  })

  const records = [...live]
  for (const port of options.ports ?? []) {
    if (records.some(r => r.port === port))
      continue
    const probed = await probePort(port, options.timeoutMs)
    if (probed)
      records.push(probed)
  }

  const instances: IndexedInstance[] = await Promise.all(records.map(async (record) => {
    const entry: IndexedInstance = {
      id: record.id,
      name: record.name,
      pid: record.pid,
      port: record.port,
      origin: record.origin,
      basePath: record.basePath,
      rootDir: record.rootDir,
      startedAt: record.startedAt,
      mcp: null,
    }
    if (!record.mcp) {
      entry.hint = MCP_DISABLED_HINT
      return entry
    }
    const url = `${record.origin}${record.mcp.path}`
    try {
      entry.mcp = { url, tools: await listInstanceTools(sdk, url) }
    }
    catch (error) {
      entry.mcp = { url, error: error instanceof Error ? error.message : String(error) }
    }
    return entry
  }))

  return {
    instances,
    ...(instances.length === 0
      ? { hint: 'No running devframe instances found. Start a devframe dev server (with --mcp for tools), or pass --port <n> to devframe connect if the instance predates the registry.' }
      : {}),
  }
}

/**
 * Probe an explicit port for a devframe serving `__connection.json` at `/`.
 * Tries the explicit address families too — a `localhost`-bound server may
 * listen on either.
 */
async function probePort(port: number, timeoutMs?: number): Promise<DevframeInstanceRecord | null> {
  for (const origin of [`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`]) {
    try {
      const response = await fetch(`${origin}/__connection.json`, {
        signal: AbortSignal.timeout(timeoutMs ?? 1000),
      })
      if (!response.ok)
        continue
      const meta = await response.json() as { mcp?: { path: string, port?: number } }
      const mcpPath = meta.mcp ? joinURL('/', meta.mcp.path) : null
      return {
        pid: -1,
        port,
        origin,
        basePath: '/',
        id: `port-${port}`,
        rootDir: '',
        mcp: mcpPath ? { path: mcpPath } : null,
        startedAt: 0,
      }
    }
    catch {
      // Try the next candidate.
    }
  }
  return null
}

async function listInstanceTools(sdk: any, url: string): Promise<{ name: string, description?: string }[]> {
  return withInstanceClient(sdk, url, async (client) => {
    const listed = await client.listTools()
    return listed.tools.map((tool: { name: string, description?: string }) => ({
      name: tool.name,
      description: tool.description,
    }))
  })
}

async function call(
  sdk: any,
  options: ConnectServerOptions,
  args: { port?: number, tool?: string, args?: Record<string, unknown> },
): Promise<unknown> {
  if (typeof args.port !== 'number' || typeof args.tool !== 'string') {
    throw Object.assign(new Error(`${CALL_TOOL} requires { port: number, tool: string }`), {
      fix: `Call ${INDEX_TOOL} to get the port and tool names, then retry.`,
    })
  }

  const { live } = await listLiveDevframeInstances({
    instancesDir: options.instancesDir,
    timeoutMs: options.timeoutMs,
  })
  const record = live.find(r => r.port === args.port) ?? await probePort(args.port, options.timeoutMs)
  if (!record) {
    throw Object.assign(new Error(`no running devframe instance on port ${args.port}`), {
      fix: `Call ${INDEX_TOOL} for the current instance list — the instance may have stopped or changed port.`,
    })
  }
  if (!record.mcp) {
    throw Object.assign(new Error(`the devframe instance on port ${args.port} has no MCP endpoint`), {
      fix: MCP_DISABLED_HINT,
    })
  }

  const url = `${record.origin}${record.mcp.path}`
  return withInstanceClient(sdk, url, async (client) => {
    const result = await client.callTool({ name: args.tool, arguments: args.args ?? {} })
    return {
      instance: { id: record.id, port: record.port },
      tool: args.tool,
      isError: result.isError ?? false,
      content: result.content,
      ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
    }
  })
}

async function withInstanceClient<T>(sdk: any, url: string, fn: (client: any) => Promise<T>): Promise<T> {
  const transport = new sdk.StreamableHTTPClientTransport(new URL(url))
  const client = new sdk.Client({ name: 'devframe-connect', version: '0.0.0' })
  await client.connect(transport)
  try {
    return await fn(client)
  }
  finally {
    await client.close().catch(() => {})
  }
}

function textResult(value: unknown): { content: { type: 'text', text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function errorResult(error: { message: string, fix?: string }): {
  isError: true
  content: { type: 'text', text: string }[]
} {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error }, null, 2) }],
  }
}

/** Parse the repeatable `--port` flag value(s) from cac into numbers. */
export function parsePortsFlag(value: unknown): number[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return values
    .map(v => Number(v))
    .filter(n => Number.isInteger(n) && n > 0 && n < 65536)
}

/** Keep the connector process alive until the stdio transport closes it. */
export function keepAlive(): void {
  // stdin stays open while the MCP client holds the pipe; nothing else to do.
  process.stdin.resume()
}
