import process from 'node:process'
import { cac } from 'cac'
import { keepAlive, parsePortsFlag, startConnectServer } from './connect'

/**
 * The `devframe` bin — the framework's own CLI, distinct from the per-app
 * CLI shells authors build with `createCac(definition)`. It hosts the
 * app-independent commands; today that is `connect`, the MCP connector.
 *
 * @experimental
 */
export async function runDevframeCli(argv: string[] = process.argv): Promise<void> {
  const cli = cac('devframe')

  cli
    .command('connect', 'Run the devframe MCP connector on stdio (discovers running devframe dev servers and proxies their tools)')
    .option('--port <port>', 'Probe an explicit port besides the instance registry (repeatable)')
    .option('--instances-dir <dir>', 'Override the instance registry directory (default: ~/.devframe/instances, or $DEVFRAME_INSTANCES_DIR)')
    .option('--timeout <ms>', 'Probe timeout per instance in milliseconds', { default: 1000 })
    .action(async (options: { port?: unknown, instancesDir?: string, timeout?: number }) => {
      await startConnectServer({
        ports: parsePortsFlag(options.port),
        instancesDir: options.instancesDir,
        timeoutMs: options.timeout,
      })
      keepAlive()
    })

  cli.help()
  cli.parse(argv, { run: false })
  await cli.runMatchedCommand()
}
