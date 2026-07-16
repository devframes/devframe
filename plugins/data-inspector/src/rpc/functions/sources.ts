import { listDataSources } from '../../registry/index'
import { defineDataInspectorRpc, NS } from './_define'

/** Every registered data source (meta only — no data). */
export const sources = defineDataInspectorRpc({
  name: `${NS}:sources`,
  type: 'query',
  jsonSerializable: true,
  agent: {
    title: 'List data sources',
    description: 'List the data sources registered with the data inspector (id, title, description, suggested queries).',
  },
  setup: () => ({
    handler: async () => listDataSources(),
  }),
})
