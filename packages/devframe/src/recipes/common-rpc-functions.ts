import { launchEditor } from 'devframe/utils/launch-editor'
import { open } from 'devframe/utils/open'
import * as v from 'valibot'
import { defineRpcFunction } from '../rpc/define'

/**
 * Prebuilt RPC action that opens a file in the user's configured editor.
 *
 * Registered name: `devframe:open-in-editor`.
 *
 * ```ts
 * import { openInEditor } from 'devframe/recipes/common-rpc-functions'
 *
 * defineDevframe({
 *   id: 'my-tool',
 *   name: 'My Tool',
 *   setup(ctx) {
 *     ctx.rpc.register(openInEditor)
 *   },
 * })
 * ```
 */
export const openInEditor = defineRpcFunction({
  name: 'devframe:open-in-editor',
  type: 'action',
  jsonSerializable: true,
  args: [v.string()],
  returns: v.void(),
  async handler(filename: string) {
    launchEditor(filename)
  },
})

/**
 * Prebuilt RPC action that reveals a path in the OS file explorer.
 *
 * Registered name: `devframe:open-in-finder`.
 *
 * ```ts
 * import { openInFinder } from 'devframe/recipes/common-rpc-functions'
 *
 * ctx.rpc.register(openInFinder)
 * ```
 */
export const openInFinder = defineRpcFunction({
  name: 'devframe:open-in-finder',
  type: 'action',
  jsonSerializable: true,
  args: [v.string()],
  returns: v.void(),
  async handler(path: string) {
    await open(path)
  },
})

/**
 * Convenience array bundling both helpers so callers can register them
 * in a single `forEach`.
 *
 * ```ts
 * import { commonRpcFunctions } from 'devframe/recipes/common-rpc-functions'
 *
 * commonRpcFunctions.forEach(fn => ctx.rpc.register(fn))
 * ```
 */
export const commonRpcFunctions = [openInEditor, openInFinder] as const
