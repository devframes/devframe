import type { Diagnostic } from 'nostics'
import { colors as c } from 'devframe/utils/colors'
import { defineDiagnostics } from 'nostics'
import { ansiFormatter } from 'nostics/formatters/ansi'

const formatAnsi = ansiFormatter(c)

interface ReporterOptions { method?: 'log' | 'warn' | 'error' }

function reporter(d: Diagnostic, { method = 'warn' }: ReporterOptions = {}): void {
  // eslint-disable-next-line no-console
  console[method](formatAnsi(d))
}

/**
 * Structured diagnostics for the code-server plugin. Uses the plugin's own
 * `DP_CODE_SERVER_` prefix per the built-in plugin convention, keeping it
 * collision-free with devframe core (`DF`) and the hub (`DF8xxx`).
 */
export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  reporters: [reporter],
  codes: {
    DP_CODE_SERVER_0001: {
      why: (p: { bin: string }) =>
        `No editor binary found (could not run "${p.bin} --version")`,
      fix: 'Install Coder code-server (`curl -fsSL https://code-server.dev/install.sh | sh`) or the Microsoft `code` CLI, or set the `bin` option to its path. See https://coder.com/docs/code-server/latest/install',
    },
    DP_CODE_SERVER_0002: {
      why: (p: { port: number, timeout: number }) =>
        `the editor did not become ready on port ${p.port} within ${p.timeout}ms`,
      fix: 'Check the editor logs for startup errors, raise `startTimeout`, or free the port.',
    },
    DP_CODE_SERVER_0003: {
      why: (p: { bin: string, reason: string }) =>
        `Failed to spawn the editor ("${p.bin}"): ${p.reason}`,
    },
    DP_CODE_SERVER_0004: {
      why: 'code-server supervisor is not initialised on this context',
      fix: 'Call setupCodeServer(ctx) (or use createCodeServerDevframe) before invoking the code-server RPCs.',
    },
    DP_CODE_SERVER_0005: {
      why: (p: { code: number }) =>
        `the editor process exited unexpectedly with code ${p.code}`,
      fix: 'Inspect the captured output in the launcher and re-launch.',
    },
    DP_CODE_SERVER_0006: {
      why: (p: { timeout: number }) =>
        `the tunnel did not open within ${p.timeout}ms`,
      fix: 'Check the tunnel logs, ensure the `code` CLI is signed in, or raise `startTimeout`.',
    },
  },
})
