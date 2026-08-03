import type { Tool } from '@modelcontextprotocol/server'
import type { DevframeInstanceRecord } from '../node/instance-registry'
import process from 'node:process'
import { toAgentToolName } from 'devframe/utils/agent-tool-name'
import { Diagnostic } from 'nostics'
import { joinURL } from 'ufo'
import { diagnostics } from '../node/diagnostics'
import { listLiveDevframeInstances, probeDevframeOrigin } from '../node/instance-registry'

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

/** One discovered instance in the `list-instances` payload: the registry record plus its probed MCP surface. */
interface IndexedInstance extends Omit<DevframeInstanceRecord, 'mcp'> {
  mcp: {
    url: string
    tools?: { name: string, description?: string }[]
    error?: string
  } | null
  hint?: string
}

/** The lazily imported MCP SDK surface `devframe connect` needs. */
interface ConnectSdk {
  Server: typeof import('@modelcontextprotocol/server').Server
  StdioServerTransport: typeof import('@modelcontextprotocol/server/stdio').StdioServerTransport
  Client: typeof import('@modelcontextprotocol/client').Client
  StreamableHTTPClientTransport: typeof import('@modelcontextprotocol/client').StreamableHTTPClientTransport
}

// Gateway tool ids follow the `devframe:<area>:<fn>` convention; the wire
// names are their sanitized forms (`devframe_connect_list-instances`, …).
const INDEX_TOOL = toAgentToolName('devframe:connect:list-instances')
const CALL_TOOL = toAgentToolName('devframe:connect:call-tool')

const MCP_DISABLED_HINT
  = 'This instance runs without an MCP route. Restart it with the --mcp flag (or set `cli.mcp: true` on its definition) to expose its tools, then list instances again.'

const GATEWAY_TOOLS: Tool[] = [
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
]

/**
 * Start the devframe MCP connector on stdio: a thin discovery + proxy server
 * in the shape Vercel's next-devtools-mcp (https://github.com/vercel/next-devtools-mcp)
 * validated — credit due there for the architecture this connector follows.
 * It exposes two gateway tools —
 * `devframe_connect_list-instances` (discover running devframe instances via
 * the instance registry and list each one's MCP tools) and
 * `devframe_connect_call-tool` (invoke one tool on one instance over its
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

  server.setRequestHandler('tools/list', async () => ({ tools: GATEWAY_TOOLS }))

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
      return errorResult(toErrorPayload(error))
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

async function importSdk(): Promise<ConnectSdk> {
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
async function index(sdk: ConnectSdk, options: ConnectServerOptions): Promise<unknown> {
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
    const { mcp, ...rest } = record
    const entry: IndexedInstance = { ...rest, mcp: null }
    if (!mcp) {
      entry.hint = MCP_DISABLED_HINT
      return entry
    }
    const url = `${record.origin}${mcp.path}`
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
 * Probe an explicit port for a devframe serving `__connection.json` at `/`,
 * reusing the registry's origin-candidate probe (a `localhost`-bound server
 * may listen on either address family).
 */
async function probePort(port: number, timeoutMs?: number): Promise<DevframeInstanceRecord | null> {
  const probed = await probeDevframeOrigin(`http://localhost:${port}`, '/', timeoutMs)
  if (!probed)
    return null
  const mcpPath = probed.meta.mcp ? joinURL('/', probed.meta.mcp.path) : null
  return {
    pid: -1,
    port,
    origin: probed.origin,
    basePath: '/',
    id: `port-${port}`,
    rootDir: '',
    mcp: mcpPath ? { path: mcpPath } : null,
    startedAt: 0,
  }
}

async function listInstanceTools(sdk: ConnectSdk, url: string): Promise<{ name: string, description?: string }[]> {
  return withInstanceClient(sdk, url, async (client) => {
    const listed = await client.listTools()
    return listed.tools.map((tool: { name: string, description?: string }) => ({
      name: tool.name,
      description: tool.description,
    }))
  })
}

async function call(
  sdk: ConnectSdk,
  options: ConnectServerOptions,
  args: { port?: number, tool?: string, args?: Record<string, unknown> },
): Promise<unknown> {
  if (typeof args.port !== 'number' || typeof args.tool !== 'string')
    throw diagnostics.DF0049()

  const { live } = await listLiveDevframeInstances({
    instancesDir: options.instancesDir,
    timeoutMs: options.timeoutMs,
  })
  const record = live.find(r => r.port === args.port) ?? await probePort(args.port, options.timeoutMs)
  if (!record)
    throw diagnostics.DF0050({ port: args.port })
  if (!record.mcp)
    throw diagnostics.DF0051({ port: args.port })

  const url = `${record.origin}${record.mcp.path}`
  return withInstanceClient(sdk, url, async (client) => {
    const result = await client.callTool({ name: args.tool!, arguments: args.args ?? {} })
    return {
      instance: { id: record.id, port: record.port },
      tool: args.tool,
      isError: result.isError ?? false,
      content: result.content,
      ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
    }
  })
}

async function withInstanceClient<T>(
  sdk: ConnectSdk,
  url: string,
  fn: (client: InstanceType<ConnectSdk['Client']>) => Promise<T>,
): Promise<T> {
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

interface ConnectErrorPayload {
  code?: string
  message: string
  fix?: string
  docs?: string
}

/**
 * Project a thrown value into the connector's structured error payload. A
 * nostics `Diagnostic` carries its code, `fix`, and docs URL across so the
 * calling agent gets the actionable next step.
 */
function toErrorPayload(error: unknown): ConnectErrorPayload {
  if (error instanceof Diagnostic) {
    return {
      code: error.code,
      message: error.message,
      ...(error.fix ? { fix: error.fix } : {}),
      ...(error.docs ? { docs: error.docs } : {}),
    }
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    ...(error && typeof error === 'object' && 'fix' in error && typeof error.fix === 'string' ? { fix: error.fix } : {}),
  }
}

function errorResult(error: ConnectErrorPayload): {
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
