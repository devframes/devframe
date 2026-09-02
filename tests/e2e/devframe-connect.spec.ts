import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { parseToolText, withConnectClient } from './_support/mcp-connect'

const REGISTRY = fileURLToPath(new URL('./.registries/files-inspector', import.meta.url))

test.describe('devframe connect (files-inspector)', () => {
  test('discovers the instance and round-trips a tool call', async () => {
    await withConnectClient(REGISTRY, async (client) => {
      // The connector exposes exactly the two gateway tools.
      const tools = await client.listTools()
      expect(tools.tools.map(t => t.name).sort()).toEqual(['devframe_connect_call-tool', 'devframe_connect_list-instances'])

      // Index: the registry-registered dev server is discovered with its
      // MCP endpoint and tool list.
      const index = parseToolText(await client.callTool({ name: 'devframe_connect_list-instances', arguments: {} }))
      const instance = index.instances.find(
        (entry: any) => entry.id === 'example:files-inspector' && entry.port === 9876,
      )
      expect(instance).toBeDefined()
      // The probe may adopt an explicit address family for a `localhost`
      // origin, so accept either spelling.
      expect(instance.mcp.url).toMatch(/^http:\/\/(?:localhost|127\.0\.0\.1):9876\/__devframe-files-inspector\/__mcp$/)
      const toolNames = instance.mcp.tools.map((t: any) => t.name)
      expect(toolNames).toContain('devframe_state_read')
      expect(toolNames).toContain('example_files-inspector_docs')

      // Call: proxy the gateway tool through the connector.
      const call = parseToolText(await client.callTool({
        name: 'devframe_connect_call-tool',
        arguments: { port: 9876, tool: 'example_files-inspector_docs' },
      }))
      expect(call.isError).toBe(false)
      const inner = JSON.parse(call.content[0].text)
      expect(inner.readmePath).toMatch(/README\.md$/)
      expect(inner.hint).toContain('Read the file')
    })
  })

  test('the call tool reports actionable errors for unknown targets', async () => {
    await withConnectClient(REGISTRY, async (client) => {
      const result = await client.callTool({
        name: 'devframe_connect_call-tool',
        arguments: { port: 1, tool: 'anything' },
      })
      expect(result.isError).toBe(true)
      const payload = parseToolText(result)
      expect(payload.error.message).toContain('No running devframe instance on port 1')
      expect(payload.error.fix).toContain('devframe_connect_list-instances')
    })
  })
})
