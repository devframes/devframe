import type { H3 } from 'h3'
import type { DevframeNodeContext } from '../types/context'
import type { DevframeDefinition } from '../types/devframe'
import type { CreateMcpFetchHandlerOptions, CreateMcpServerOptions, McpFetchHandler, McpServerHandle } from '../types/mcp'
import { diagnostics } from './diagnostics'
import { importRuntimeModule, isRuntimeModuleResolvable } from './import-runtime-module'

/**
 * The h3-bound half of the MCP adapter contract (the SDK-neutral half lives
 * in `types/mcp.ts`, which must stay lib-neutral; h3's declarations are not).
 */
export interface MountMcpHttpOptions extends CreateMcpFetchHandlerOptions {}

export interface MountedMcpHttp {
  /** Tear down the MCP handler (aborts in-flight exchanges, drops the change bridge). */
  dispose: () => Promise<void>
}

/** The surface `@devframes/agentic/mcp` exports, as devframe's loaders consume it. */
export interface AgenticMcpModule {
  /** Build an MCP server over the agent surface of a devframe definition (stdio). */
  createMcpServer: (definition: DevframeDefinition, options?: CreateMcpServerOptions) => Promise<McpServerHandle>
  /** Build a framework-agnostic `Request → Response` MCP endpoint over a devframe context. */
  createMcpFetchHandler: (ctx: DevframeNodeContext, options: CreateMcpFetchHandlerOptions) => McpFetchHandler
  /** Mount a stateless MCP endpoint on an h3 app at `path`. */
  mountMcpHttp: (app: H3, ctx: DevframeNodeContext, path: string, options: MountMcpHttpOptions) => MountedMcpHttp
}

// `@devframes/agentic` is devframe's optional peer carrying the MCP adapter
// and the MCP SDK. These helpers implement the enable matrix around it:
// probe (never import) to decide, warn once under `'auto'` when the peer is
// absent, throw a coded error when an explicit `mcp` setting needs it.

const AGENTIC_PACKAGE = '@devframes/agentic'

/**
 * Whether `@devframes/agentic` is resolvable from devframe's own location
 * (where its optional peer is linked). A pure `require.resolve` probe: no
 * module is loaded, so the `'auto'` miss path stays zero-cost.
 */
export function isAgenticInstalled(pkg: string = AGENTIC_PACKAGE): boolean {
  return isRuntimeModuleResolvable(`${pkg}/package.json`)
}

let warnedMissing = false

/** Report DF0078 (agent surface without `@devframes/agentic`) once per process. */
export function warnAgenticMcpMissingOnce(): void {
  if (warnedMissing)
    return
  warnedMissing = true
  diagnostics.DF0078()
}

/**
 * Load the MCP adapter from `@devframes/agentic/mcp`, mapping a failed load
 * (typically: the optional peer is not installed) to a thrown `DF0079`.
 * Loads through `importRuntimeModule`, so the adapter and the MCP SDK behind
 * it never enter a consumer's bundle graph.
 */
export async function importAgenticMcp(specifier: string = `${AGENTIC_PACKAGE}/mcp`): Promise<AgenticMcpModule> {
  try {
    return await importRuntimeModule<AgenticMcpModule>(specifier)
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw diagnostics.DF0079({ reason, cause: error })
  }
}
