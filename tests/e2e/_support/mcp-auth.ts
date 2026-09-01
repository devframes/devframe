/**
 * The bearer `devframe connect` presents to an authenticated instance MCP
 * route (via `DEVFRAME_MCP_AUTH_TOKEN`). Shared between `playwright.config.ts`
 * (which starts the `hub-next` server with it) and the connect support helper
 * (which spawns the connector with it), so the two agree on the credential.
 * Kept dependency-free so the Playwright config can import it cheaply.
 */
export const MCP_AUTH_TOKEN = 'devframe-e2e-mcp-auth-token'
