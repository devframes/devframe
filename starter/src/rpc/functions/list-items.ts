import { readdir } from 'node:fs/promises'
import process from 'node:process'
import { defineRpcFunction } from 'devframe'

/**
 * A `query` RPC with `snapshot: true`: live over WebSocket in dev, and its
 * dump is baked into a static build so the SPA keeps working with no server.
 * Lists the top-level entries of the working directory.
 */
export const listItems = defineRpcFunction({
  name: 'list-items',
  type: 'query',
  jsonSerializable: true,
  snapshot: true,
  setup: ctx => ({
    handler: async () => {
      const cwd = process.env.DEVFRAME_E2E_CWD || ctx.cwd
      const entries = await readdir(cwd, { withFileTypes: true })
      return entries
        .filter(e => !e.name.startsWith('.'))
        .map(e => ({ name: e.name, kind: e.isDirectory() ? 'dir' as const : 'file' as const }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
  }),
})
