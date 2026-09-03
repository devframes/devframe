import type { DevframeInspectInstanceInfo } from '../../types'
import process from 'node:process'
import { listLiveDevframeInstances } from 'devframe/internal'
import { defineInspectRpc } from './_define'

/**
 * Enumerate every devframe dev server currently running on this machine,
 * discovered through the shared instance registry (`~/.devframe/instances/`)
 * with a `__connection.json` liveness probe, the same discovery that backs
 * the `devframe connect` bin. Powers the inspector's read-only Instances tab.
 *
 * Deliberately **not** `snapshot` (the set of live processes is meaningless
 * baked into a static dump, so the Instances tab is hidden in `build`/`spa`
 * mode) and **not** agent-exposed (the `devframe connect` bin already offers
 * instance discovery to agents over MCP, so exposing it here would duplicate
 * that surface).
 */
export const listInstances = defineInspectRpc({
  name: 'devframes:plugin:inspect:list-instances',
  type: 'query',
  jsonSerializable: true,
  setup: () => ({
    handler: async (): Promise<DevframeInspectInstanceInfo[]> => {
      const { live } = await listLiveDevframeInstances()
      const currentPid = process.pid
      return live.map(record => ({
        id: record.id,
        name: record.name,
        port: record.port,
        origin: record.origin,
        basePath: record.basePath,
        url: `${record.origin}${record.basePath}`,
        pid: record.pid,
        rootDir: record.rootDir,
        startedAt: record.startedAt,
        hasMcp: record.mcp != null,
        isCurrent: record.pid === currentPid,
      }))
    },
  }),
})
