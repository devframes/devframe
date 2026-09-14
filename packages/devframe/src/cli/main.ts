import process from 'node:process'
import { cac } from 'cac'
import { diagnostics } from '../node/diagnostics'
import { importRuntimeModule } from '../node/import-runtime-module'

/** The surface `devframe connect` consumes from `@devframes/agentic/connect`. */
interface AgenticConnectModule {
  startConnectServer: (options: {
    ports?: number[]
    instancesDir?: string
    timeoutMs?: number
    authToken?: string
  }) => Promise<{ stop: () => Promise<void> }>
}

/** Parse the repeatable `--port` flag value(s) from cac into numbers. */
function parsePortsFlag(value: unknown): number[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return values
    .map(v => Number(v))
    .filter(n => Number.isInteger(n) && n > 0 && n < 65536)
}

/**
 * Load the connector from the optional `@devframes/agentic` peer, mapping a
 * failed load (typically: the peer is not installed) to a thrown `DF0046`.
 */
async function importConnect(): Promise<AgenticConnectModule> {
  try {
    return await importRuntimeModule<AgenticConnectModule>('@devframes/agentic/connect')
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw diagnostics.DF0046({ reason, cause: error })
  }
}

/**
 * The `devframe` bin is the framework's own CLI, distinct from the per-app
 * CLI shells authors build with `createCac(definition)`. It hosts the
 * app-independent commands; today that is `connect`, the MCP connector.
 */
export async function runDevframeCli(argv: string[] = process.argv): Promise<void> {
  const cli = cac('devframe')

  cli
    .command('connect', 'Run the devframe MCP connector on stdio (discovers running devframe dev servers and proxies their tools)')
    .option('--port <port>', 'Probe an explicit port besides the instance registry (repeatable)')
    .option('--instances-dir <dir>', 'Override the instance registry directory (default: ~/.devframe/instances, or $DEVFRAME_INSTANCES_DIR)')
    .option('--timeout <ms>', 'Probe timeout per instance in milliseconds', { default: 1000 })
    .action(async (options: { port?: unknown, instancesDir?: string, timeout?: number }) => {
      const { startConnectServer } = await importConnect()
      await startConnectServer({
        ports: parsePortsFlag(options.port),
        instancesDir: options.instancesDir,
        timeoutMs: options.timeout,
        /**
         * The bearer for authenticated instance MCP routes comes from the
         * environment, never a CLI flag: command-line arguments are visible to
         * any process on the machine (`ps`, `/proc`), which would defeat it.
         */
        authToken: process.env.DEVFRAME_MCP_AUTH_TOKEN,
      })
      // Keep the connector process alive until the stdio transport closes
      // it: stdin stays open while the MCP client holds the pipe.
      process.stdin.resume()
    })

  cli.help()
  cli.parse(argv, { run: false })
  // A bare `devframe` (no subcommand) also leaves `matchedCommand` unset,
  // same as `-h`/`--help`, which cac already prints help for internally.
  // Only step in for the *other* unset case (no help flag, no command) so
  // `--help` doesn't print twice.
  if (!cli.matchedCommand) {
    if (!cli.options.help)
      cli.outputHelp()
    return
  }
  await cli.runMatchedCommand()
}
