import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { parseToolText, withConnectClient } from './_support/mcp-connect'

const ORIGIN = 'http://localhost:9878'
const REGISTRY = fileURLToPath(new URL('./.registries/next-hub', import.meta.url))

test.describe('devframe connect (next-devframe-hub)', () => {
  test('discovers the in-process hub endpoint and calls an agent-flagged command', async () => {
    test.setTimeout(180_000)

    // The hub boots lazily on the first route hit; the connection meta
    // answers 503 until the side-car WS is live and the meta is published.
    await expect.poll(async () => {
      try {
        const response = await fetch(`${ORIGIN}/__devframes/__connection.json`)
        return response.status
      }
      catch {
        return 0
      }
    }, { timeout: 150_000, intervals: [1000] }).toBe(200)

    // The meta advertises the in-process MCP endpoint — same origin as the
    // Next app, no side-car port (the `/_next/mcp` shape).
    const meta = await (await fetch(`${ORIGIN}/__devframes/__connection.json`)).json() as {
      mcp?: { path: string, port?: number }
    }
    expect(meta.mcp).toEqual({ path: '__mcp' })

    await withConnectClient(REGISTRY, async (client) => {
      // Index: the hub registered itself (explicitly — it runs in-process,
      // not via createDevServer) with the Next server's own origin.
      const index = parseToolText(await client.callTool({ name: 'devframe_connect_list-instances', arguments: {} }))
      const hub = index.instances.find((entry: any) => entry.id === 'example:next-devframe-hub')
      expect(hub).toBeDefined()
      // The probe may adopt an explicit address family for the recorded
      // `localhost` origin — accept either spelling.
      expect(hub.mcp.url).toMatch(/^http:\/\/(?:localhost|127\.0\.0\.1):9878\/__devframes\/__mcp$/)

      // The hub's agent surface flows through: the agent-flagged hub command,
      // the built-in devframe_state_read, and the git service's agent-flagged
      // reads (the git plugin now exposes git through `@devframes/service-git`).
      const toolNames = hub.mcp.tools.map((t: any) => t.name)
      expect(toolNames).toContain('example_next-devframe-hub_ping')
      expect(toolNames).toContain('devframe_state_read')
      expect(toolNames).toContain('devframes_service_git_status')

      // Call the agent-flagged hub command through the connector.
      const ping = parseToolText(await client.callTool({
        name: 'devframe_connect_call-tool',
        arguments: { port: 9878, tool: 'example_next-devframe-hub_ping' },
      }))
      expect(ping.isError).toBe(false)
      expect(ping.content[0].text).toBe('pong')
    })
  })
})
