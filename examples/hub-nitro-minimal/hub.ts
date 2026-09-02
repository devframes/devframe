import type { HubInstance } from '@devframes/hub/initiate'
import { createUi } from '@devframes/hub-ui'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import { createA11yDevframe } from '@devframes/plugin-a11y'
import { createAssetsDevframe } from '@devframes/plugin-assets'
import { createCodeServerDevframe } from '@devframes/plugin-code-server'
import { createDataInspectorDevframe } from '@devframes/plugin-data-inspector'
import { createGitDevframe } from '@devframes/plugin-git'
import { createInspectDevframe } from '@devframes/plugin-inspect'
import { createMessagesDevframe } from '@devframes/plugin-messages'
import { createOgDevframe } from '@devframes/plugin-og'
import { createTerminalsDevframe } from '@devframes/plugin-terminals'

// Plugins mounted under /__devframes/, the reference UI in the hub's ui slot,
// and the RPC socket on a side-car port (Nitro routes can't accept WS
// upgrades, so `ws.sidecar` requests one). Memoized on globalThis so a
// dev-time reload reuses the hub instead of leaking another side-car.
const globalRef = globalThis as { __hubNitroMinimal?: HubInstance }

export const hub: HubInstance = globalRef.__hubNitroMinimal ??= initHub({
  base: DEVFRAMES_HUB_BASE,
  ws: { sidecar: true },
  /**
   * Every built-in plugin, dogfooded end to end through the hub mount path.
   * `data-inspector`'s default id carries `:` (a route-param marker), so it
   * gets a colon-free id override to be a valid `<base><id>/` segment; the
   * assets watcher is off since this host demonstrates mounting, not authoring.
   */
  devframes: [
    createGitDevframe(),
    createTerminalsDevframe(),
    createCodeServerDevframe(),
    createInspectDevframe(),
    createDataInspectorDevframe({ id: 'devframes_plugin_data-inspector' }),
    createA11yDevframe(),
    createMessagesDevframe(),
    createOgDevframe(),
    createAssetsDevframe({ watch: false }),
  ],
  /**
   * Rebrand the reference UI to Nitro's own pink/red in one field, no CSS:
   * `createUi`'s `branding` option publishes `ConnectionMeta.configs.ui.branding`,
   * which the dock reads at connect time and feeds into `--devframe-primary`
   * (see `@devframes/hub-ui`'s `primary-ramp.css`).
   */
  ui: createUi({ branding: { primaryColor: '#ff2056', productName: 'Devframes on Nitro' } }),
  /**
   * Gate with devframe's interactive OTP (the default). The hub prints a
   * 6-digit code + magic link on startup, and the reference UI's authorization
   * view exchanges it for a bearer token. See docs/content/1.guide/13.security.md.
   */
  configure(ctx) {
    ctx.commands.register({
      id: 'example:hub-nitro-minimal:ping',
      title: 'Nitro Hub · Ping',
      icon: 'ph:bell-duotone',
      category: 'kit',
      handler: () => 'pong',
    })
  },
})
