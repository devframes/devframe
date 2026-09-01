import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { MCP_AUTH_TOKEN } from './mcp-auth'

const BIN = fileURLToPath(new URL('../../../packages/devframe/bin/devframe.mjs', import.meta.url))

/**
 * Spawn `devframe connect` over stdio against a hermetic registry dir and
 * hand a connected MCP client to `fn`, tearing the process down after. The
 * connector reads `DEVFRAME_MCP_AUTH_TOKEN` to authenticate against instances
 * whose MCP route requires a bearer (harmless for origin-only routes).
 */
export async function withConnectClient<T>(
  instancesDir: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [BIN, 'connect', '--instances-dir', instancesDir],
    // Merged with the SDK's safe default env (which carries PATH etc.).
    env: { DEVFRAME_MCP_AUTH_TOKEN: MCP_AUTH_TOKEN },
  })
  const client = new Client({ name: 'devframe-e2e', version: '0.0.0' })
  await client.connect(transport)
  try {
    return await fn(client)
  }
  finally {
    await client.close()
  }
}

/** Parse the JSON payload the connector returns in its single text block. */
export function parseToolText(result: unknown): any {
  const content = (result as { content: Array<{ type: string, text: string }> }).content
  return JSON.parse(content[0]!.text)
}
