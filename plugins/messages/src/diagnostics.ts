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
 * Structured diagnostics for `@devframes/plugin-messages`. Node-side only.
 * Codes use the plugin-private `DP_MESSAGES_` band (see the built-in
 * plugins planning index) so they never collide with devframe core
 * (`DF00xx`) or `@devframes/hub` (`DF80xx`).
 */
export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  reporters: [reporter],
  codes: {
    DP_MESSAGES_0001: {
      why: (p: { id: string }) =>
        `"${p.id}" is mounted on a context without a hub messages host (\`ctx.messages\`) — its RPC surface stays registered but no-ops, so the panel will show an empty feed.`,
      fix: 'Mount this devframe through a hub host (`@devframes/hub`\'s `createHubContext` + `mountDevframe`) to get a live message feed.',
    },
  },
})
