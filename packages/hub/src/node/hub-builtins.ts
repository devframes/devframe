import type { HubNodeContext } from './context'
import { diagnostics } from './diagnostics'

/**
 * Register the hub's framework-neutral built-in RPC commands. Each
 * built-in delegates to an optional host capability; when the host does
 * not implement the capability, the command throws `DF8500`.
 *
 * Today: `hub:open-path` (delegates to `host.openPath`). New built-ins
 * land in this file with their own diagnostic code in the `DF85xx`
 * sub-range.
 */
export function registerHubBuiltins(context: HubNodeContext): void {
  context.commands.register({
    id: 'hub:open-path',
    title: 'Open Path in Editor',
    icon: 'ph:pencil-duotone',
    // Programmatic command — invoked via RPC by tool code, not by the
    // user from the command palette directly. Hide from palette search.
    showInPalette: false,
    handler: async (filepath: unknown, line?: unknown, column?: unknown) => {
      const openPath = context.host.openPath
      if (!openPath) {
        throw diagnostics.DF8500({ id: 'hub:open-path' })
      }
      if (typeof filepath !== 'string' || !filepath) {
        throw new TypeError('hub:open-path: `filepath` must be a non-empty string')
      }
      return openPath(
        filepath,
        typeof line === 'number' ? line : undefined,
        typeof column === 'number' ? column : undefined,
      )
    },
  })
}
