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
 * Structured diagnostics for the terminals plugin. Uses the plugin's own
 * `DP_TERMINALS_` prefix per the built-in plugin convention, keeping it
 * collision-free with devframe core (`DF`) and the hub (`DF8xxx`).
 */
export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  reporters: [reporter],
  codes: {
    DP_TERMINALS_0001: {
      why: (p: { id: string }) => `Terminal session "${p.id}" does not exist`,
      fix: 'Spawn a session first, or refresh the session list.',
    },
    DP_TERMINALS_0002: {
      why: (p: { command: string }) => `Spawning the arbitrary command "${p.command}" is not allowed`,
      fix: 'Add it to `presets`, or pass `allowArbitraryCommands: true` to createTerminalsDevframe().',
    },
    DP_TERMINALS_0003: {
      why: (p: { id: string }) => `Cannot write to read-only terminal session "${p.id}"`,
      fix: 'Spawn the session with `mode: "interactive"` to accept input.',
    },
    DP_TERMINALS_0004: {
      why: (p: { command: string, reason: string }) => `Failed to spawn "${p.command}": ${p.reason}`,
    },
    DP_TERMINALS_0005: {
      why: 'Native PTY bindings (zigpty) are unavailable; interactive sessions fall back to pipe-based terminal emulation. Full-screen TUIs may not render correctly.',
      fix: 'Check that this platform is covered by zigpty\'s prebuilds (Linux/macOS/Windows, x64/arm64, glibc/musl) and that the dependency installed intact.',
    },
    DP_TERMINALS_0006: {
      why: (p: { id: string }) => `Unknown terminal preset "${p.id}"`,
    },
    DP_TERMINALS_0007: {
      why: 'Terminals manager is not initialised on this context',
      fix: 'Call setupTerminals(ctx) (or use createTerminalsDevframe) before invoking terminal RPCs.',
    },
  },
})
