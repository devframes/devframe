// The `cac` command-line framework is an optional peer dependency: it's
// only pulled in through this adapter entry, so tools that assemble their
// own CLI from the lower-level `createDevServer` / `createBuild` /
// `createMcpServer` factories never need it installed. Install `cac`
// alongside `devframe` to opt into `createCac`; importing this entry
// without it throws at load time with the usual Node module-not-found
// error. The typed-flag helpers (`defineCliFlags` / `parseCliFlags`) are
// re-exported below so they live alongside the CLI adapter.
//
// The historical `devframe/adapters/cli` entry (`createCli`) re-exports
// this module under deprecated aliases for backward compatibility.
import type { CAC } from 'cac'
import type { H3 } from 'h3'
import type { DevframeDefinition } from '../types/devframe'
import process from 'node:process'
import cac from 'cac'
import { colors as c } from 'devframe/utils/colors'
import { createBuild } from './build'
import { createDevServer, resolveDevServerPort } from './dev'
import { flagKeyToOption, isBooleanFlag, parseCliFlags } from './flags'

export { defineCliFlags, parseCliFlags } from './flags'
export type { CliFlagsSchema, InferCliFlags } from './flags'

export interface CreateCacOptions {
  /** Default port for `dev` (default: 9999). */
  defaultPort?: number
  /**
   * Final CAC hook invoked after devframe's built-in subcommands and
   * after the definition's `cli.configure`. Use this to add app-level
   * flags and commands at the assembly stage.
   */
  configureCli?: (cli: CAC) => void
  /**
   * Called once the dev server is listening. Use this to print a
   * startup banner or trigger side-effects that depend on the live URL.
   */
  onReady?: (info: { origin: string, port: number, app: H3 }) => void | Promise<void>
}

export interface CacHandle {
  /**
   * Raw CAC instance. Mutate before calling `parse()` for last-mile
   * flag or command additions that don't fit `configureCli`.
   */
  cli: CAC
  parse: (argv?: string[]) => Promise<void>
}

/**
 * Wrap a {@link DevframeDefinition} in a `cac`-powered command-line
 * interface exposing `dev` / `build` / `mcp` subcommands.
 *
 * Requires the optional `cac` peer dependency.
 */
export function createCac(d: DevframeDefinition, options: CreateCacOptions = {}): CacHandle {
  const defaultPort = options.defaultPort ?? d.cli?.port ?? 9999
  const defaultHost = d.cli?.host ?? 'localhost'
  const command = d.cli?.command ?? d.id

  const cli = cac(command)

  const devCommand = cli
    .command('[...args]', 'Start a local dev server')
    .option('--port <port>', 'Port to listen on')
    .option('--host <host>', 'Host to bind to', { default: defaultHost })
    .option('--open', 'Open the browser on start')
    .option('--no-open', 'Do not open the browser')
    // Standalone auth is on by default; `--no-auth` opts a one-off run out of
    // the interactive OTP gate. The `true` default CAC injects is harmless —
    // the dev server only acts on an explicit `auth: false`.
    .option('--no-auth', 'Disable the interactive authentication gate')
    // Only `--mcp` is declared: CAC's `--no-*` auto-negation would inject a
    // `true` default, silently enabling MCP. Declaring just `--mcp` yields the
    // opt-in tri-state — absent → `undefined` (falls through to `cli.mcp`),
    // `--mcp` → `true`, `--no-mcp` → `false` (handled by CAC's `--no-` prefix).
    .option('--mcp', 'Expose an MCP server over HTTP at /__mcp (use --no-mcp to disable) [experimental]')

  // Register typed flags from the definition ahead of `cli.configure`
  // so authors can still override or augment via the escape hatch.
  if (d.cli?.flags) {
    for (const [key, schema] of Object.entries(d.cli.flags)) {
      const optionName = flagKeyToOption(key)
      const description = (schema as any).description ?? ''
      if (isBooleanFlag(schema)) {
        devCommand.option(`--${optionName}`, description)
      }
      else {
        devCommand.option(`--${optionName} <value>`, description)
      }
    }
  }

  devCommand.action(async (_args: unknown, rawFlags: CliFlags) => {
    const flags = resolveTypedFlags(d, rawFlags) as CliFlags
    const host = (flags.host as string | undefined) ?? defaultHost
    const port = (flags.port as number | undefined) ?? await resolveDevServerPort(d, { host, defaultPort })
    // `--mcp` / `--no-mcp` map to a boolean override; when neither is
    // passed CAC leaves `mcp` undefined so `createDevServer` falls through
    // to `def.cli?.mcp`.
    const mcp = flags.mcp as boolean | undefined
    await createDevServer(d, {
      host,
      port,
      flags,
      mcp,
      onReady: options.onReady,
    })
  })

  cli
    .command('build', 'Build a self-contained static deploy of the devframe')
    .option('--out-dir <outDir>', 'Output directory', { default: 'dist-static' })
    .option('--base <base>', 'URL base', { default: '/' })
    .option('--pretty', 'Pretty-print dump JSON (larger on disk)')
    .action(async (flags: { outDir: string, base?: string, pretty?: boolean }) => {
      await createBuild(d, { outDir: flags.outDir, base: flags.base, pretty: flags.pretty })
    })

  cli
    .command('mcp', 'Start an MCP server exposing agent-facing tools (stdio) [experimental]')
    .action(async () => {
      // MCP clients expect JSON-RPC on stdout — route welcome/logging
      // noise out of the way. Logs-SDK diagnostics land on stderr by
      // default, so nothing extra needed beyond not printing here.
      const { createMcpServer } = await import('./mcp')
      await createMcpServer(d, {
        transport: 'stdio',
        // Deliberately go to stderr: stdout is the MCP transport.
        onReady: ({ transport }) => {
          console.error(`[devframe] "${d.id}" MCP server ready (${transport})`)
        },
      })
    })

  // Definition-level capability hook first, then assembly-level hook.
  d.cli?.configure?.(cli)
  options.configureCli?.(cli)

  cli.help()
  cli.version('0.0.0')

  return {
    cli,
    async parse(argv = process.argv) {
      cli.parse(argv, { run: false })
      await cli.runMatchedCommand()
    },
  }
}

interface CliFlags {
  host?: string
  port?: number
  open?: boolean
  [key: string]: unknown
}

function resolveTypedFlags(d: DevframeDefinition, raw: Record<string, unknown>): Record<string, unknown> {
  if (!d.cli?.flags)
    return raw
  const { flags, issues } = parseCliFlags(d.cli.flags, raw)
  if (issues?.length) {
    for (const issue of issues)
      console.error(c.red`[devframe] invalid flag — ${issue}`)
    process.exit(1)
  }
  return flags
}
