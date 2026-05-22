import process from 'node:process'
import { defineRpcFunction } from 'devframe'
import { glob } from 'tinyglobby'

export const listFiles = defineRpcFunction({
  name: 'devframe-files-inspector:list-files',
  type: 'query',
  jsonSerializable: true,
  snapshot: true,
  setup: ctx => ({
    handler: async () => {
      const cwd = process.env.DEVFRAME_E2E_CWD || ctx.cwd
      const files = await glob(['*'], { cwd, onlyFiles: true, dot: false })
      return files.map(f => f.replace(/\\/g, '/')).sort()
    },
  }),
})
