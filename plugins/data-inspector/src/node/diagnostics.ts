import { defineDiagnostics } from 'nostics'

/**
 * Structured diagnostics for `@devframes/plugin-data-inspector`. Node-side
 * only. Codes use the plugin-private `DP_DATA_INSPECTOR_` band so they never
 * collide with devframe core (`DF00xx`) or `@devframes/hub` (`DF80xx`).
 */
export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  codes: {
    DP_DATA_INSPECTOR_0001: {
      why: (p: { id: string }) => `No data source is registered under "${p.id}".`,
      fix: 'List the available sources via the `sources` RPC (or `listDataSources()`), and make sure the contributor registered the source before querying it.',
    },
    DP_DATA_INSPECTOR_0002: {
      why: (p: { filepath: string }) => `Unsupported data file "${p.filepath}".`,
      fix: 'The standalone CLI loads .json and .jsonl/.ndjson files. Convert the data, or register a custom source via the registry.',
    },
    DP_DATA_INSPECTOR_0003: {
      why: (p: { filepath: string, message: string }) => `Failed to load data file "${p.filepath}": ${p.message}`,
      fix: 'Check that the file exists and contains valid JSON (or one JSON value per line for .jsonl/.ndjson).',
    },
  },
})
