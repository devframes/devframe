import { OPEN_SERVICE_PACKAGE } from '@devframes/service-open'
import { s } from 'devframe/utils/simple-schema'
import { isAbsolute, resolve } from 'pathe'
import { diagnostics } from '../../diagnostics'
import { defineMessagesRpc } from './_define'

/**
 * Open a message's file position in the user's editor, delegating to the
 * `@devframes/service-open` wire service the plugin declares. Message
 * producers often report workspace-relative files, so the plugin resolves
 * them against `ctx.workspaceRoot` server-side — the client never needs the
 * server's filesystem layout. The panel gates its affordance on the service
 * advertisement (`rpc.services.has('@devframes/service-open')`).
 */
export const messagesOpenFile = defineMessagesRpc({
  name: 'devframes:plugin:messages:open-file',
  type: 'action',
  jsonSerializable: true,
  args: [s.object({
    file: s.string(),
    line: s.optional(s.number()),
    column: s.optional(s.number()),
  })],
  returns: s.void(),
  setup: ctx => ({
    handler: (async (input: { file: string, line?: number, column?: number }): Promise<void> => {
      const open = ctx.services.get(OPEN_SERVICE_PACKAGE)
      if (!open)
        throw diagnostics.DP_MESSAGES_0002()
      const path = isAbsolute(input.file) ? input.file : resolve(ctx.workspaceRoot, input.file)
      await open.openInEditor({ path, line: input.line, column: input.column })
    }) as any,
  }),
})
