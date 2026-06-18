import type { AgentManifest } from 'devframe/types'
import { defineInspectRpc } from './_define'

/**
 * Surface the agent-exposed surface of the connection: the unified
 * manifest of tools (RPC functions flagged with `agent`, plus
 * host-registered tools) and readable resources. `snapshot: true` bakes
 * the manifest into the static dump for `build`/`spa` mode.
 */
export const describeAgent = defineInspectRpc({
  name: 'devframes-plugin-inspect:describe-agent',
  type: 'query',
  jsonSerializable: true,
  snapshot: true,
  agent: {
    description: 'Describe the agent-exposed surface of this devframe: the list of tools (agent-flagged RPC functions and host-registered tools) and readable resources, with their titles, descriptions, safety hints, and schemas. Read-only.',
    title: 'Describe agent surface',
  },
  setup: ctx => ({
    handler: async (): Promise<AgentManifest> => {
      return ctx.agent.list()
    },
  }),
})
