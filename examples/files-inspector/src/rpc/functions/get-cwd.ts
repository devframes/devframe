import process from 'node:process'
import { defineRpcFunction } from 'devframe'

export const getCwd = defineRpcFunction({
  name: 'devframe-files-inspector:get-cwd',
  type: 'static',
  jsonSerializable: true,
  setup: ctx => ({
    handler: () => ({ cwd: process.env.DEVFRAME_E2E_CWD || ctx.cwd }),
  }),
})
