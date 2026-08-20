import process from 'node:process'
import { defineRpcFunction } from 'devframe'

/**
 * A `static` RPC: its result can be baked into a static build (no live
 * server needed). Scoped registration namespaces it to
 * `devframe-starter:get-info` at runtime.
 */
export const getInfo = defineRpcFunction({
  name: 'get-info',
  type: 'static',
  jsonSerializable: true,
  setup: ctx => ({
    handler: () => ({
      cwd: process.env.DEVFRAME_E2E_CWD || ctx.cwd,
      node: process.version,
    }),
  }),
})
