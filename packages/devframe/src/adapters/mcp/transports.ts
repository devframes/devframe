import type { Server } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'

/**
 * Start the MCP server on stdio. Returns a stop function.
 * @internal
 */
export async function startStdioTransport(server: Server): Promise<() => Promise<void>> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  return async () => {
    await server.close()
  }
}
