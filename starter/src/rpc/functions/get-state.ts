import { readdir } from 'node:fs/promises'
import process from 'node:process'
import { defineRpcFunction } from 'devframe'

export interface StarterItem {
  name: string
  kind: 'dir' | 'file'
}

export interface StarterState {
  cwd: string
  node: string
  items: StarterItem[]
}

/**
 * A `query` RPC with `snapshot: true`: live over WebSocket in dev, and its
 * dump is baked into a static build so the SPA keeps working with no server.
 * The one round trip the client makes - runtime info plus the top-level
 * entries of the working directory.
 *
 * The `agent` field is the same function's second view: it becomes an MCP
 * tool for coding agents, served automatically (`mcp: 'auto'`) at
 * `<base>__mcp` in dev and over stdio via `pnpm run dev -- mcp`.
 */
export const getState = defineRpcFunction({
  name: 'get-state',
  type: 'query',
  jsonSerializable: true,
  snapshot: true,
  agent: {
    description: 'Read the devframe-starter state: the Node version and the top-level entries of the working directory.',
  },
  setup: ctx => ({
    handler: async (): Promise<StarterState> => {
      const cwd = process.env.DEVFRAME_E2E_CWD || ctx.cwd
      const entries = await readdir(cwd, { withFileTypes: true })
      const items = entries
        .filter(e => !e.name.startsWith('.'))
        .map(e => ({ name: e.name, kind: e.isDirectory() ? 'dir' as const : 'file' as const }))
        .sort((a, b) => a.name.localeCompare(b.name))
      return { cwd, node: process.version, items }
    },
  }),
})
