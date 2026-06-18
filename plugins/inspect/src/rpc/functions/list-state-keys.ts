import { defineInspectRpc } from './_define'

/**
 * Enumerate the keys of every shared-state entry published on the
 * connection. Values are fetched lazily by the client via the built-in
 * `devframe:rpc:server-state:get` (with live subscription), so this only
 * returns the key list. `snapshot: true` keeps it listable in static
 * `build`/`spa` mode.
 */
export const listStateKeys = defineInspectRpc({
  name: 'devframes-plugin-inspect:list-state-keys',
  type: 'query',
  jsonSerializable: true,
  snapshot: true,
  agent: {
    description: 'List the keys of all shared-state entries published by this devframe connection. Read-only. Pair with the built-in shared-state reads to inspect individual values.',
    title: 'List shared-state keys',
  },
  setup: ctx => ({
    handler: async (): Promise<string[]> => {
      return [...ctx.rpc.sharedState.keys()].sort()
    },
  }),
})
