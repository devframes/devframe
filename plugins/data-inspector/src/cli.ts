/**
 * Standalone CLI — `devframe-data-inspector`:
 *
 * ```sh
 * devframe-data-inspector stats.json trace.jsonl   # inspect local data files
 * devframe-data-inspector attach                   # attach via ./node_modules/.data-inspector/agent.json
 * devframe-data-inspector attach ws://127.0.0.1:9878 --token <token>
 * devframe-data-inspector build stats.json         # self-contained static export
 * ```
 */
import type { AgentDiscovery } from './agent/index'
import { existsSync, readFileSync } from 'node:fs'
import { cp, mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cac } from 'cac'
import { createDevServer } from 'devframe/adapters/dev'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import { serveStaticNodeMiddleware } from 'devframe/utils/serve-static'
import { getPort } from 'get-port-please'
import pkg from '../package.json' with { type: 'json' }
import { AGENT_DISCOVERY_FILE } from './agent/index'
import { createDataInspectorDevframe } from './index'
import { createFileDataSource, loadDataFile } from './node/files'
import { listDataSources, registerDataSource } from './registry/index'

const distDir = fileURLToPath(new URL('../dist/spa', import.meta.url))

/** The static-export dataset consumed by the SPA in static mode. */
export interface StaticDataset {
  sources: Array<{
    id: string
    title: string
    description?: string
    icon?: string
    static: boolean
    queries?: { query: string, title?: string, description?: string }[]
    data: unknown
  }>
}

export function createDataInspectorCli() {
  const cli = cac('data-inspector')
  cli.version(pkg.version)

  cli
    .command('[...files]', 'Inspect local data files (.json / .jsonl / .ndjson)')
    .option('--port <port>', 'Port to listen on')
    .option('--host <host>', 'Host to bind to', { default: 'localhost' })
    .option('--open', 'Open the browser on start')
    .option('--no-open', 'Do not open the browser')
    .action(async (files: string[], flags: { port?: number, host: string, open?: boolean }) => {
      for (const file of files)
        registerDataSource(createFileDataSource(file))
      const def = createDataInspectorDevframe()
      await createDevServer(def, {
        host: flags.host,
        port: flags.port ? Number(flags.port) : undefined,
        flags: flags as Record<string, unknown>,
      })
    })

  cli
    .command('attach [endpoint]', 'Attach to a process running the data-inspector agent')
    .option('--token <token>', 'Pre-shared token (defaults to the discovery file\'s)')
    .option('--port <port>', 'Local port for the inspector UI')
    .option('--host <host>', 'Host to bind the UI to', { default: '127.0.0.1' })
    .action(async (endpoint: string | undefined, flags: { token?: string, port?: number, host: string }) => {
      let websocket = endpoint
      let token = flags.token
      if (!websocket) {
        // No endpoint given: discover the agent advertised by a process
        // started from this directory.
        const discoveryPath = resolve(process.cwd(), AGENT_DISCOVERY_FILE)
        if (!existsSync(discoveryPath)) {
          console.error(`No agent endpoint given and no discovery file at ${discoveryPath}.`)
          console.error('Start the target with the agent (see @devframes/plugin-data-inspector/agent) or pass a ws:// endpoint.')
          process.exitCode = 1
          return
        }
        const discovery = JSON.parse(readFileSync(discoveryPath, 'utf-8')) as AgentDiscovery
        websocket = discovery.websocket
        token ??= discovery.token
      }

      const port = flags.port ? Number(flags.port) : await getPort({ port: 9014, portRange: [9014, 9114] })
      const serveSpa = serveStaticNodeMiddleware(distDir)
      const server = createServer((req, res) => {
        if (req.url?.startsWith(`/${DEVFRAME_CONNECTION_META_FILENAME}`)) {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ backend: 'websocket', websocket }))
          return
        }
        serveSpa(req, res, () => {
          res.statusCode = 404
          res.end('not found')
        })
      })
      await new Promise<void>(done => server.listen(port, flags.host, done))
      const url = `http://${flags.host}:${port}/${token ? `?di_token=${token}` : ''}`
      console.log(`data-inspector attached to ${websocket}`)
      console.log(`open ${url}`)
    })

  cli
    .command('build [...files]', 'Build a self-contained static inspector for data files')
    .option('--out-dir <outDir>', 'Output directory', { default: 'dist-data-inspector' })
    .action(async (files: string[], flags: { outDir: string }) => {
      for (const file of files)
        registerDataSource(createFileDataSource(file))

      const outDir = resolve(process.cwd(), flags.outDir)
      await mkdir(outDir, { recursive: true })
      await cp(distDir, outDir, { recursive: true })

      // Embed the raw parsed data per source: the SPA's static backend runs
      // the same engine client-side, so filters and normalization still
      // apply per query.
      const metas = listDataSources()
      const dataset: StaticDataset = { sources: [] }
      for (const meta of metas) {
        const file = meta.description // absolute path recorded by createFileDataSource
        dataset.sources.push({ ...meta, data: file ? await loadDataFile(file) : null })
      }
      await writeFile(join(outDir, 'data-inspector-static.json'), JSON.stringify(dataset))
      await writeFile(
        join(outDir, DEVFRAME_CONNECTION_META_FILENAME),
        `${JSON.stringify({ backend: 'static' })}\n`,
      )
      console.log(`static inspector written to ${outDir} (${dataset.sources.length} source${dataset.sources.length === 1 ? '' : 's'})`)
    })

  cli.help()

  return {
    cli,
    parse: async (argv?: string[]) => {
      cli.parse(argv, { run: false })
      await cli.runMatchedCommand()
    },
  }
}
